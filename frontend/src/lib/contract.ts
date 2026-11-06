import { ethers } from "ethers";
import { privateKeyFromEnv } from "./env";
import { WHITECHAIN_RPC } from "./constants";

const ENIGMA_ABI = [
  "function balances(address) external view returns (uint256)",
  "function getJob(uint256 jobId) external view returns (tuple(address user, uint8 status, uint256 createdAt, uint256 deadline, uint256 completedAt, uint32 expirySeconds, uint256 payment, bytes32 fileHash, bytes32 resultHash, bytes32 attestationHash))",
  "function queryPrice() external view returns (uint256)",
  "function nextJobId() external view returns (uint256)",
  "function createJob(bytes32 fileHash, uint32 expirySeconds) external returns (uint256)",
  "function createJobFor(address user, bytes32 fileHash, uint32 expirySeconds) external returns (uint256)",
  "function completeJob(uint256 jobId, bytes32 resultHash, bytes32 attestationHash, bytes signature) external",
  "function startProcessing(uint256 jobId) external",
  "function failJob(uint256 jobId, string reason) external",
  "function markExpired(uint256 jobId) external",
  "function markKeyDestroyed(uint256 jobId, bytes32 receiptHash) external",
  "function refundJob(uint256 jobId) external",
  "function deposit(uint256 amount) external",
  "function keyDestructionReceipt(uint256 jobId) external view returns (bytes32)",
  "event JobCreated(uint256 indexed jobId, address indexed user, bytes32 fileHash, uint256 payment, uint32 expirySeconds)",
  "event JobCompleted(uint256 indexed jobId, address indexed user, bytes32 resultHash, bytes32 attestationHash, address signer, uint64 expiresAt)",
  "event JobProcessing(uint256 indexed jobId)",
  "event JobFailed(uint256 indexed jobId, string reason)",
  "event JobExpired(uint256 indexed jobId)",
  "event JobKeyDestroyed(uint256 indexed jobId, bytes32 receiptHash)",
];

const JOB_STATUS = [
  "None", "Pending", "Processing", "Completed",
  "Failed", "Refunded", "Expired", "KeyDestroyed",
] as const;

function getProvider() {
  return new ethers.JsonRpcProvider(WHITECHAIN_RPC);
}

function getContract(signerOrProvider?: ethers.Signer | ethers.Provider) {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress) throw new Error("CONTRACT_ADDRESS not configured");
  return new ethers.Contract(
    contractAddress,
    ENIGMA_ABI,
    signerOrProvider || getProvider()
  );
}

export async function getBalance(userAddress: string): Promise<string> {
  const contract = getContract();
  const balance: bigint = await contract.balances(userAddress);
  return ethers.formatUnits(balance, 6);
}

export interface OnChainJob {
  user: string;
  status: string;
  createdAt: number;
  deadline: number;
  completedAt: number;
  expirySeconds: number;
  payment: string;
  fileHash: string;
  resultHash: string;
  attestationHash: string;
}

export async function getJobOnChain(jobId: number): Promise<OnChainJob> {
  const contract = getContract();
  const job = await contract.getJob(jobId);
  return {
    user: job.user,
    status: JOB_STATUS[Number(job.status)] || "Unknown",
    createdAt: Number(job.createdAt),
    deadline: Number(job.deadline),
    completedAt: Number(job.completedAt),
    expirySeconds: Number(job.expirySeconds),
    payment: ethers.formatUnits(job.payment, 6),
    fileHash: job.fileHash,
    resultHash: job.resultHash,
    attestationHash: job.attestationHash,
  };
}

function getSigner() {
  return new ethers.Wallet(privateKeyFromEnv("DEPLOYER_PRIVATE_KEY"), getProvider());
}

export async function createJobOnChain(
  fileHash: string,
  expirySeconds: number,
  userAddress?: string
): Promise<{ jobId: number; txHash: string }> {
  const signer = getSigner();
  const contract = getContract(signer);
  const tx = userAddress
    ? await contract.createJobFor(userAddress, fileHash, expirySeconds)
    : await contract.createJob(fileHash, expirySeconds);
  const receipt = await tx.wait();

  const log = receipt.logs.find(
    (l: ethers.Log) => contract.interface.parseLog(l)?.name === "JobCreated"
  );
  const parsed = log ? contract.interface.parseLog(log) : null;
  const jobId = parsed ? Number(parsed.args[0]) : 0;

  return { jobId, txHash: receipt.hash };
}

export async function completeJobOnChain(
  jobId: number,
  resultHash: string,
  attestationHash: string,
  signature: string
): Promise<string> {
  const signer = getSigner();
  const contract = getContract(signer);
  const tx = await contract.completeJob(jobId, resultHash, attestationHash, signature);
  const receipt = await tx.wait();
  return receipt.hash;
}

export async function refundJobOnChain(jobId: number): Promise<string> {
  const signer = getSigner();
  const contract = getContract(signer);
  const tx = await contract.refundJob(jobId);
  const receipt = await tx.wait();
  return receipt.hash;
}

export async function startProcessingOnChain(jobId: number): Promise<string> {
  const signer = getSigner();
  const contract = getContract(signer);
  const tx = await contract.startProcessing(jobId);
  const receipt = await tx.wait();
  return receipt.hash;
}

export async function failJobOnChain(jobId: number, reason: string): Promise<string> {
  const signer = getSigner();
  const contract = getContract(signer);
  const tx = await contract.failJob(jobId, reason);
  const receipt = await tx.wait();
  return receipt.hash;
}

export async function markExpiredOnChain(jobId: number): Promise<string> {
  const signer = getSigner();
  const contract = getContract(signer);
  const tx = await contract.markExpired(jobId);
  const receipt = await tx.wait();
  return receipt.hash;
}

export async function markKeyDestroyedOnChain(jobId: number, receiptHash: string): Promise<string> {
  const signer = getSigner();
  const contract = getContract(signer);
  const tx = await contract.markKeyDestroyed(jobId, receiptHash);
  const receipt = await tx.wait();
  return receipt.hash;
}

export async function getQueryPrice(): Promise<string> {
  const contract = getContract();
  const price: bigint = await contract.queryPrice();
  return ethers.formatUnits(price, 6);
}

export async function getNextJobId(): Promise<number> {
  const contract = getContract();
  const id: bigint = await contract.nextJobId();
  return Number(id);
}

// Reads the job table directly instead of scanning events: public RPCs reject eth_getLogs over a
// wide block range ("Block range is too large"), and the scan from block 0 always hit that.
// Scans the newest `scanLimit` jobs, in small concurrent batches, and returns the caller's in id order.
export async function getJobHistory(
  userAddress: string,
  scanLimit = 200
): Promise<(OnChainJob & { jobId: number })[]> {
  const contract = getContract();
  const next = Number(await contract.nextJobId());
  const first = Math.max(1, next - scanLimit);
  const mine: (OnChainJob & { jobId: number })[] = [];
  const BATCH = 10;
  for (let start = first; start < next; start += BATCH) {
    const ids = Array.from({ length: Math.min(BATCH, next - start) }, (_, i) => start + i);
    const jobs = await Promise.all(ids.map(async (jobId) => ({ ...(await getJobOnChain(jobId)), jobId })));
    for (const job of jobs) {
      if (job.user.toLowerCase() === userAddress.toLowerCase()) mine.push(job);
    }
  }
  return mine;
}
