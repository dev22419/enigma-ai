import { ethers } from "ethers";
import { WHITECHAIN_RPC } from "./constants";

const ENIGMA_ABI = [
  "function balances(address) external view returns (uint256)",
  "function getJob(uint256 jobId) external view returns (tuple(address user, uint8 status, uint256 createdAt, uint256 deadline, uint256 completedAt, uint32 expirySeconds, uint256 payment, bytes32 fileHash, bytes32 resultHash, bytes32 attestationHash))",
  "function queryPrice() external view returns (uint256)",
  "function nextJobId() external view returns (uint256)",
  "function createJob(bytes32 fileHash, uint32 expirySeconds) external returns (uint256)",
  "function completeJob(uint256 jobId, bytes32 resultHash, bytes32 attestationHash, bytes signature) external",
  "function startProcessing(uint256 jobId) external",
  "function failJob(uint256 jobId, string reason) external",
  "function refundJob(uint256 jobId) external",
  "function markExpired(uint256 jobId) external",
  "function markKeyDestroyed(uint256 jobId) external",
  "function deposit(uint256 amount) external",
  "event JobCreated(uint256 indexed jobId, address indexed user, bytes32 fileHash, uint256 payment, uint32 expirySeconds)",
  "event JobCompleted(uint256 indexed jobId, address indexed user, bytes32 resultHash, bytes32 attestationHash, address signer, uint64 expiresAt)",
  "event JobProcessing(uint256 indexed jobId)",
  "event JobFailed(uint256 indexed jobId, string reason)",
  "event JobExpired(uint256 indexed jobId)",
  "event JobKeyDestroyed(uint256 indexed jobId)",
];

const JOB_STATUS = ["None", "Pending", "Processing", "Completed", "Failed", "Refunded", "Expired", "KeyDestroyed"] as const;

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
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) throw new Error("DEPLOYER_PRIVATE_KEY not configured");
  return new ethers.Wallet(key, getProvider());
}

export async function createJobOnChain(
  fileHash: string,
  expirySeconds: number
): Promise<{ jobId: number; txHash: string }> {
  const signer = getSigner();
  const contract = getContract(signer);
  const tx = await contract.createJob(fileHash, expirySeconds);
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

export async function markKeyDestroyedOnChain(jobId: number): Promise<string> {
  const signer = getSigner();
  const contract = getContract(signer);
  const tx = await contract.markKeyDestroyed(jobId);
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

export async function getJobHistory(
  userAddress: string
): Promise<(OnChainJob & { jobId: number })[]> {
  const contract = getContract();
  const filter = contract.filters.JobCreated(null, userAddress);
  const events = await contract.queryFilter(filter);

  const jobs = await Promise.all(
    events.map(async (event) => {
      const log = event as ethers.EventLog;
      const jobId = Number(log.args[0]);
      const job = await getJobOnChain(jobId);
      return { ...job, jobId };
    })
  );

  return jobs;
}
