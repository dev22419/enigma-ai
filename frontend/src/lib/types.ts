import type { TaskType } from "./constants";

export interface Job {
  id: string;
  userId: string;
  taskType: TaskType;
  fileName: string;
  fileHash: string;
  resultHash: string | null;
  attestationHash: string | null;
  txHash: string | null;
  status: "pending" | "processing" | "completed" | "expired";
  ttl: number;
  createdAt: number;
  expiresAt: number | null;
  result: string | null;
}

export interface CreateJobRequest {
  taskType: TaskType;
  ttl: number;
  fileName: string;
  fileContent: string;
}

export interface CreateJobResponse {
  jobId: string;
  status: string;
  result: string | null;
  requestId: string;
  attestationHash: string;
  createTxHash: string;
  txHash: string;
  arkivEntityKey: string;
  keyId: string;
  expiresAt: number;
  accessToken: string;
}

export interface JobReceipt {
  jobId: string;
  requestId: string | null;
  createTxHash: string | null;
  completeTxHash: string | null;
  attestationHash: string | null;
  resultHash: string | null;
  fileHash: string;
  arkivEntityKey: string | null;
  expiresAt: number | null;
  keyDestroyed: boolean;
  destruction: import("./store").DestructionReceipt | null;
}
