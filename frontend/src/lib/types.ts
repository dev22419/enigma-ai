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
  fileHash: string;
  encryptedFile: string;
}

export interface CreateJobResponse {
  jobId: string;
  createTxHash: string;
  inputStorage: { rootHash: string; txHash: string } | null;
  accessToken: string;
}

export interface InferRequest {
  taskType: TaskType;
  content: string;
  fileName: string;
}

export interface InferResponse {
  result: string;
  chatId: string;
  resultHash: string;
  attestationHash: string;
  provider: string;
  requestId: string;
}

export interface StoreResultRequest {
  encryptedResult: string;
  resultHash: string;
  attestationHash: string;
  chatId: string;
}

export interface StoreResultResponse {
  completeTxHash: string;
  arkivEntityKey: string;
  expiresAt: number;
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
  destruction: import("./store").DestructionReceipt | null;
}
