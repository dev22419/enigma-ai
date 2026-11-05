import { ethers } from "ethers";
import { WHITECHAIN_RPC } from "./constants";

const ENIGMA_ABI = [
  "function balances(address) external view returns (uint256)",
  "function getJob(uint256 jobId) external view returns (tuple(address user, uint8 status, uint256 createdAt, uint256 deadline, uint256 completedAt, uint32 expirySeconds, uint256 payment, bytes32 fileHash, bytes32 resultHash, bytes32 attestationHash))",
  "function queryPrice() external view returns (uint256)",
  "function nextJobId() external view returns (uint256)",
  "function createJob(bytes32 fileHash, uint32 expirySeconds) external returns (uint256)",
  "function completeJob(uint256 jobId, bytes32 resultHash, bytes32 attestationHash, bytes signature) external",
  "function deposit(uint256 amount) external",
];

const JOB_STATUS = ["None", "Pending", "Completed", "Refunded"] as const;

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
): Promise<OnChainJob[]> {
  const nextId = await getNextJobId();
  const jobs: OnChainJob[] = [];

  for (let i = 1; i < nextId; i++) {
    const job = await getJobOnChain(i);
    if (job.user.toLowerCase() === userAddress.toLowerCase()) {
      jobs.push(job);
    }
  }

  return jobs;
}
