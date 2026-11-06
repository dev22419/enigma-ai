import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

export type KeyState = "CREATED" | "ACTIVE" | "EXPIRY_PENDING" | "DESTROYED";

export interface KeyEntry {
  keyId: string;
  jobId: string;
  keyMaterial: string;
  state: KeyState;
  createdAt: number;
  expiresAt: number;
  destroyedAt: number | null;
}

export interface DestructionReceipt {
  jobId: string;
  keyId: string;
  expiryTimestamp: number;
  destructionTimestamp: number;
  status: "DESTROYED";
}

const DATA_DIR = join(process.cwd(), ".data");
const STORE_PATH = join(DATA_DIR, "keys.json");

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadStore(): KeyEntry[] {
  ensureDir();
  if (!existsSync(STORE_PATH)) return [];
  return JSON.parse(readFileSync(STORE_PATH, "utf-8"));
}

function saveStore(entries: KeyEntry[]) {
  ensureDir();
  writeFileSync(STORE_PATH, JSON.stringify(entries, null, 2));
}

export function createKey(
  keyId: string,
  jobId: string,
  keyMaterial: string,
  ttlSeconds: number,
): KeyEntry {
  const entries = loadStore();
  const now = Math.floor(Date.now() / 1000);
  const entry: KeyEntry = {
    keyId,
    jobId,
    keyMaterial,
    state: "CREATED",
    createdAt: now,
    expiresAt: now + ttlSeconds,
    destroyedAt: null,
  };
  entries.push(entry);
  saveStore(entries);
  return entry;
}

export function activateKey(keyId: string): void {
  const entries = loadStore();
  const entry = entries.find((e) => e.keyId === keyId);
  if (!entry) throw new Error(`Key not found: ${keyId}`);
  if (entry.state !== "CREATED") throw new Error(`Cannot activate key in state: ${entry.state}`);
  entry.state = "ACTIVE";
  saveStore(entries);
}

export function getKeyByJobId(jobId: string): KeyEntry | null {
  const entries = loadStore();
  return entries.find((e) => e.jobId === jobId) ?? null;
}

export function getActiveKey(keyId: string): KeyEntry | null {
  const entries = loadStore();
  const entry = entries.find((e) => e.keyId === keyId);
  if (!entry || entry.state !== "ACTIVE") return null;
  return entry;
}

export function getExpiredActiveKeys(): KeyEntry[] {
  const entries = loadStore();
  const now = Math.floor(Date.now() / 1000);
  return entries.filter((e) => e.state === "ACTIVE" && e.expiresAt <= now);
}

export function markExpiring(keyId: string): void {
  const entries = loadStore();
  const entry = entries.find((e) => e.keyId === keyId);
  if (!entry) throw new Error(`Key not found: ${keyId}`);
  entry.state = "EXPIRY_PENDING";
  saveStore(entries);
}

export function destroyKey(keyId: string): DestructionReceipt {
  const entries = loadStore();
  const entry = entries.find((e) => e.keyId === keyId);
  if (!entry) throw new Error(`Key not found: ${keyId}`);
  if (entry.state === "DESTROYED") {
    return {
      jobId: entry.jobId,
      keyId: entry.keyId,
      expiryTimestamp: entry.expiresAt,
      destructionTimestamp: entry.destroyedAt!,
      status: "DESTROYED",
    };
  }

  const now = Math.floor(Date.now() / 1000);
  entry.keyMaterial = "0".repeat(entry.keyMaterial.length);
  entry.state = "DESTROYED";
  entry.destroyedAt = now;
  saveStore(entries);

  return {
    jobId: entry.jobId,
    keyId: entry.keyId,
    expiryTimestamp: entry.expiresAt,
    destructionTimestamp: now,
    status: "DESTROYED",
  };
}

export function getDestructionReceipt(jobId: string): DestructionReceipt | null {
  const entries = loadStore();
  const entry = entries.find((e) => e.jobId === jobId && e.state === "DESTROYED");
  if (!entry || !entry.destroyedAt) return null;
  return {
    jobId: entry.jobId,
    keyId: entry.keyId,
    expiryTimestamp: entry.expiresAt,
    destructionTimestamp: entry.destroyedAt,
    status: "DESTROYED",
  };
}
