import { promises as fs } from "node:fs";
import path from "node:path";

export type KeyState = "ACTIVE" | "EXPIRY_PENDING" | "DESTROYED" | "DESTRUCTION_FAILED";

export interface KeyRow {
  keyId: string;
  jobId: string;
  // base64 key material; null once destroyed
  keyMaterial: string | null;
  state: KeyState;
  createdAt: number;
  expiresAt: number;
}

export interface JobRow {
  jobId: string;
  fileName: string;
  fileHash: string;
  inputCiphertextHash: string | null;
  resultHash: string | null;
  attestationHash: string | null;
  requestId: string | null;
  arkivEntityKey: string | null;
  createTxHash: string | null;
  completeTxHash: string | null;
  status: "processing" | "completed" | "failed";
  error: string | null;
  createdAt: number;
  expiresAt: number | null;
  // Encrypted input as stored on 0G Storage (ciphertext only). Absent when storage is not configured.
  inputStorage?: { rootHash: string; txHash: string } | null;
  // Set by the refund worker for jobs that failed after payment was locked.
  refund?: { state: "REFUNDED" | "NOT_REQUIRED"; txHash: string | null; at: number } | null;
  accessToken?: string;
  // Wallet that paid for the job (createJobFor), when one signed for it.
  payer?: string;
  // The enclave's answer for this job, recorded by /api/infer. The result route only accepts these values.
  inferred?: { resultHash: string; attestationHash: string; chatId: string; at: number };
  // Set while an inference is running, and counts tries, so one paid job can't be used to spend unlimited 0G credit.
  inferring?: number;
  inferAttempts?: number;
  // The browser's key-wipe receipt, anchored on-chain by /api/jobs/[id]/destroyed.
  keyWipe?: { receiptHash: string; destructionTimestamp: number; anchorTxHash: string };
}

export interface DestructionReceipt {
  version: 1;
  jobId: string;
  keyId: string;
  expiryTimestamp: number;
  destructionTimestamp: number;
  status: "destroyed";
  receiptHash: string;
  signer: string;
  signature: string;
}

interface Data {
  keys: Record<string, KeyRow>;
  jobs: Record<string, JobRow>;
  receipts: Record<string, DestructionReceipt>;
  // Digest of each used wallet authorization -> the time it stops being valid (replay protection).
  auth?: Record<string, number>;
}

// Keys live in their own collection, apart from job metadata, so a key row can
// be removed without touching anything a receipt depends on.
const FILE = () =>
  path.join(process.env.ENIGMA_DATA_DIR ?? path.join(process.cwd(), ".enigma-data"), "store.json");

// In-memory fallback: on read-only filesystems (Vercel serverless) the file
// write silently fails, so the in-memory cache is the only state that survives
// between requests in the same warm instance. On writable filesystems (local
// dev, tests) the file is always authoritative.
const g = globalThis as unknown as {
  __enigmaLock?: Promise<unknown>;
  __enigmaMemStore?: Data;
  __enigmaMemPath?: string;
};

async function load(): Promise<Data> {
  const file = FILE();
  if (g.__enigmaMemPath !== file) {
    g.__enigmaMemStore = undefined;
    g.__enigmaMemPath = file;
  }
  try {
    const data = JSON.parse(await fs.readFile(file, "utf8")) as Data;
    g.__enigmaMemStore = data;
    return data;
  } catch {
    return g.__enigmaMemStore ?? { keys: {}, jobs: {}, receipts: {} };
  }
}

async function save(data: Data): Promise<void> {
  g.__enigmaMemStore = data;
  g.__enigmaMemPath = FILE();
  try {
    const file = FILE();
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    await fs.rename(tmp, file);
  } catch {
    // File write may fail on read-only filesystems (Vercel); the in-memory
    // cache is still authoritative for this instance's lifetime.
  }
}

export function withStore<T>(fn: (data: Data) => T | Promise<T>): Promise<T> {
  const run = (g.__enigmaLock ?? Promise.resolve()).then(async () => {
    const data = await load();
    const out = await fn(data);
    await save(data);
    return out;
  });
  g.__enigmaLock = run.catch(() => undefined);
  return run;
}

export async function readStore(): Promise<Data> {
  await (g.__enigmaLock ?? Promise.resolve());
  return load();
}
