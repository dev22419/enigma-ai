// AI-assisted: Used Claude for the browser API client
import type { CreateJobResponse } from "@/lib/types";
import type { TaskType } from "@/lib/constants";

export interface JobView {
  jobId: number;
  user: string;
  status: string;
  createdAt: number;
  completedAt: number;
  expirySeconds: number;
  payment: string;
  fileHash: string;
  resultHash: string;
  attestationHash: string;
  requestId: string | null;
  arkivEntityKey: string | null;
  createTxHash: string | null;
  completeTxHash: string | null;
  expiresAt: number | null;
  result: string | null;
  keyState: string | null;
  keyDestroyed: boolean;
  arkivEntityExists: boolean;
  ciphertextPreview: string | null;
  destruction: { destructionTimestamp?: number; receiptHash?: string; signer?: string } | null;
}

export interface ReceiptView {
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
  destruction: { destructionTimestamp?: number; receiptHash?: string; signer?: string } | null;
  destructionReceiptValid: boolean | null;
}

export interface HistoryJob {
  jobId: number;
  status: string;
  createdAt: number;
  completedAt: number;
  expirySeconds: number;
  payment: string;
  fileHash: string;
  expiresAt: number | null;
  error: string | null;
  keyState: string | null;
  keyDestroyed: boolean;
}

export interface BalanceView {
  address: string;
  balance: string;
  queryPrice: string;
  queriesRemaining: number;
}

async function read<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body as T;
}

export const getJob = (id: string | number) => read<JobView>(`/api/jobs/${id}`);
export const getReceipt = (id: string | number) => read<ReceiptView>(`/api/jobs/${id}/receipt`);
export const getBalance = (address: string) => read<BalanceView>(`/api/balance?address=${address}`);
export const getHistory = (address: string) =>
  read<{ jobs: HistoryJob[] }>(`/api/history?address=${address}`).then((r) => r.jobs);

export const createJob = (input: { taskType: TaskType; ttl: number; fileName: string; fileContent: string }) =>
  read<CreateJobResponse>("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

/** The moment a result stops being readable, from the stored expiry or the on-chain timing. */
export function expiryOf(job: { expiresAt: number | null; completedAt: number; expirySeconds: number }): number | null {
  if (job.expiresAt) return job.expiresAt;
  return job.completedAt ? job.completedAt + job.expirySeconds : null;
}

export type JobPhase = "running" | "live" | "expired" | "destroyed" | "failed";

export function phaseOf(job: {
  status: string;
  keyDestroyed: boolean;
  expiresAt: number | null;
  completedAt: number;
  expirySeconds: number;
}): JobPhase {
  if (job.keyDestroyed) return "destroyed";
  if (job.status === "Refunded" || job.status === "Failed") return "failed";
  if (job.status === "Pending" || job.status === "Processing") return "running";
  const expiry = expiryOf(job);
  return expiry && expiry * 1000 > Date.now() ? "live" : "expired";
}

export const short = (value: string | null | undefined, head = 8, tail = 6) =>
  !value ? "None" : value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;

const ZERO_HASH = /^0x0+$/;
export const hasHash = (value: string | null | undefined) => !!value && !ZERO_HASH.test(value);

// Jobs started in this browser, so people can find them again. Ids and file names only.
const KEY = "enigma-jobs";

export interface LocalJob {
  id: string;
  fileName: string;
  taskType: string;
  createdAt: number;
}

export function localJobs(): LocalJob[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function rememberJob(job: LocalJob) {
  localStorage.setItem(KEY, JSON.stringify([job, ...localJobs().filter((j) => j.id !== job.id)].slice(0, 50)));
}
