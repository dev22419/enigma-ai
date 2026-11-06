// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title EnigmaAI
/// @notice Prepaid-balance escrow for private AI jobs. A company deposits USDT, each job locks the
///         query price, and the price is released to the service provider only when a registered
///         oracle signer attests (EIP-712) that the TEE-verified result matches the job.
///         The contract does not verify TEE attestations on-chain: the backend verifies the 0G TEE
///         signature off-chain and a registered signer key vouches for (job, resultHash, attestationHash).
contract EnigmaAI is Ownable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    /// @dev Job lifecycle. `createJob` locks the payment in the same transaction, so the product's
    ///      CREATED and PAID steps are one on-chain step (`Pending`).
    ///        Pending -> Processing -> Completed -> Expired -> KeyDestroyed     (happy path)
    ///        Pending | Processing -> Failed -> Refunded                         (provider failed)
    ///        Pending | Processing -> Refunded                                   (deadline passed)
    enum Status {
        None, // 0: does not exist
        Pending, // 1: created, payment locked
        Processing, // 2: a signer acknowledged the job; inference is running
        Completed, // 3: result attested, payment released to the provider
        Failed, // 4: a signer reported the job failed; payment is refundable now
        Refunded, // 5: payment returned to the user's balance
        Expired, // 6: the result's lifetime ended
        KeyDestroyed // 7: a signer attested the job's encryption key was destroyed
    }

    struct Job {
        address user;
        Status status;
        uint64 createdAt;
        uint64 deadline; // fixed at creation: completeJob allowed until, refundJob allowed after
        uint64 completedAt;
        uint32 expirySeconds; // how long the result lives in Arkiv
        uint256 payment;
        bytes32 fileHash;
        bytes32 resultHash;
        bytes32 attestationHash;
    }

    bytes32 public constant COMPLETE_TYPEHASH = keccak256(
        "Complete(uint256 jobId,address user,bytes32 fileHash,bytes32 resultHash,bytes32 attestationHash)"
    );

    uint32 public constant MIN_EXPIRY = 1 minutes; // the 2-minute demo timer and the backend's 60s floor must fit
    uint32 public constant MAX_EXPIRY = 30 days;

    IERC20 public immutable usdt;

    /// @notice Address that receives released payments (AI compute / service provider).
    address public provider;
    /// @notice Price locked per query, in token units (USDT uses 6 decimals).
    uint256 public queryPrice;
    /// @notice Seconds after createJob during which a job may be completed; after it, refundJob is open.
    uint64 public jobTimeout;

    uint256 public nextJobId = 1;
    mapping(address => uint256) public balances;
    mapping(uint256 => Job) private _jobs;
    mapping(address => bool) public isSigner;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event JobCreated(
        uint256 indexed jobId, address indexed user, bytes32 fileHash, uint256 payment, uint32 expirySeconds
    );
    event JobCompleted(
        uint256 indexed jobId,
        address indexed user,
        bytes32 resultHash,
        bytes32 attestationHash,
        address signer,
        uint64 expiresAt
    );
    event JobRefunded(uint256 indexed jobId, address indexed user, uint256 amount);
    event SignerAdded(address indexed signer);
    event SignerRemoved(address indexed signer);
    event ProviderUpdated(address indexed provider);
    event QueryPriceUpdated(uint256 price);
    event JobTimeoutUpdated(uint64 timeout);

    error ZeroAddress();
    error ZeroAmount();
    error InsufficientBalance();
    error InvalidExpiry();
    error InvalidJobStatus();
    error NotJobOwner();
    error JobTimedOut();
    error JobNotTimedOut();
    error UnauthorizedSigner();
    error SignerAlreadyRegistered();
    error SignerNotRegistered();

    constructor(IERC20 usdt_, address provider_, uint256 queryPrice_, uint64 jobTimeout_, address initialOwner)
        Ownable(initialOwner)
        EIP712("EnigmaAI", "1")
    {
        if (address(usdt_) == address(0) || provider_ == address(0)) revert ZeroAddress();
        if (queryPrice_ == 0 || jobTimeout_ == 0) revert ZeroAmount();
        usdt = usdt_;
        provider = provider_;
        queryPrice = queryPrice_;
        jobTimeout = jobTimeout_;
    }

    // ---------------------------------------------------------------- balance

    /// @notice Fund the caller's prepaid balance. Requires prior USDT approval.
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        balances[msg.sender] += amount;
        usdt.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    /// @notice Withdraw unlocked balance (funds locked in pending jobs are not withdrawable).
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (balances[msg.sender] < amount) revert InsufficientBalance();
        balances[msg.sender] -= amount;
        usdt.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    // ------------------------------------------------------------------- jobs

    /// @notice Lock one query price from the caller's balance and open a job.
    /// @param fileHash content hash of the encrypted file stored on 0G Storage
    /// @param expirySeconds lifetime of the result in Arkiv (1 minute to 30 days)
    function createJob(bytes32 fileHash, uint32 expirySeconds) external returns (uint256 jobId) {
        if (expirySeconds < MIN_EXPIRY || expirySeconds > MAX_EXPIRY) revert InvalidExpiry();
        uint256 price = queryPrice;
        if (balances[msg.sender] < price) revert InsufficientBalance();

        balances[msg.sender] -= price;
        jobId = nextJobId++;
        _jobs[jobId] = Job({
            user: msg.sender,
            status: Status.Pending,
            createdAt: uint64(block.timestamp),
            deadline: uint64(block.timestamp) + jobTimeout,
            completedAt: 0,
            expirySeconds: expirySeconds,
            payment: price,
            fileHash: fileHash,
            resultHash: bytes32(0),
            attestationHash: bytes32(0)
        });

        emit JobCreated(jobId, msg.sender, fileHash, price, expirySeconds);
    }

    /// @notice Release payment to the provider once a registered signer attests to the result.
    ///         Callable by anyone (typically the backend relayer) with the oracle signature.
    function completeJob(uint256 jobId, bytes32 resultHash, bytes32 attestationHash, bytes calldata signature)
        external
        nonReentrant
    {
        Job storage job = _jobs[jobId];
        if (job.status != Status.Pending) revert InvalidJobStatus();
        if (block.timestamp > job.deadline) revert JobTimedOut();

        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(COMPLETE_TYPEHASH, jobId, job.user, job.fileHash, resultHash, attestationHash))
        );
        address signer = ECDSA.recover(digest, signature);
        if (!isSigner[signer]) revert UnauthorizedSigner();

        job.status = Status.Completed;
        job.completedAt = uint64(block.timestamp);
        job.resultHash = resultHash;
        job.attestationHash = attestationHash;

        usdt.safeTransfer(provider, job.payment);

        emit JobCompleted(
            jobId, job.user, resultHash, attestationHash, signer, uint64(block.timestamp) + job.expirySeconds
        );
    }

    /// @notice Return a pending job's locked payment to the user's balance after the timeout.
    ///         Callable by anyone.
    function refundJob(uint256 jobId) external {
        Job storage job = _jobs[jobId];
        if (job.status != Status.Pending) revert InvalidJobStatus();
        if (block.timestamp <= job.deadline) revert JobNotTimedOut();

        job.status = Status.Refunded;
        balances[job.user] += job.payment;
        emit JobRefunded(jobId, job.user, job.payment);
    }

    function getJob(uint256 jobId) external view returns (Job memory) {
        return _jobs[jobId];
    }

    // ------------------------------------------------------------------ admin

    function addSigner(address signer) external onlyOwner {
        if (signer == address(0)) revert ZeroAddress();
        if (isSigner[signer]) revert SignerAlreadyRegistered();
        isSigner[signer] = true;
        emit SignerAdded(signer);
    }

    function removeSigner(address signer) external onlyOwner {
        if (!isSigner[signer]) revert SignerNotRegistered();
        isSigner[signer] = false;
        emit SignerRemoved(signer);
    }

    function setProvider(address provider_) external onlyOwner {
        if (provider_ == address(0)) revert ZeroAddress();
        provider = provider_;
        emit ProviderUpdated(provider_);
    }

    /// @notice Affects only jobs created after the change; existing jobs keep their locked payment.
    function setQueryPrice(uint256 price) external onlyOwner {
        if (price == 0) revert ZeroAmount();
        queryPrice = price;
        emit QueryPriceUpdated(price);
    }

    /// @notice Affects only jobs created after the change; existing jobs keep their deadline.
    function setJobTimeout(uint64 timeout) external onlyOwner {
        if (timeout == 0) revert ZeroAmount();
        jobTimeout = timeout;
        emit JobTimeoutUpdated(timeout);
    }
}
