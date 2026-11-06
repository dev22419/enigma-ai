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
  taskType: string;
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
}

// Keys live in their own collection, apart from job metadata, so a key row can
// be removed without touching anything a receipt depends on.
const FILE = () =>
  path.join(process.env.ENIGMA_DATA_DIR ?? path.join(process.cwd(), ".enigma-data"), "store.json");

// One chain per process; every read-modify-write goes through it.
const g = globalThis as unknown as { __enigmaLock?: Promise<unknown> };

async function load(): Promise<Data> {
  try {
    return JSON.parse(await fs.readFile(FILE(), "utf8")) as Data;
  } catch {
    return { keys: {}, jobs: {}, receipts: {} };
  }
}

async function save(data: Data): Promise<void> {
  const file = FILE();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  await fs.rename(tmp, file);
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
