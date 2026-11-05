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
  txHash: string | null;
  attestationHash: string | null;
  expiresAt: number | null;
}

export interface JobReceipt {
  jobId: string;
  txHash: string;
  attestationHash: string;
  resultHash: string;
  fileHash: string;
  expired: boolean;
}
