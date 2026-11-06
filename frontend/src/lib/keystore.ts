import { ethers } from "ethers";
import { privateKeyFromEnv } from "./env";
import { newJobKey, newKeyId } from "./crypto";
import { withStore, readStore, type DestructionReceipt, type KeyRow } from "./store";

export async function createKey(jobId: string, expiresAt: number): Promise<{ keyId: string; key: Buffer }> {
  const key = newJobKey();
  const keyId = newKeyId();
  await withStore((d) => {
    d.keys[jobId] = {
      keyId,
      jobId,
      keyMaterial: key.toString("base64"),
      state: "ACTIVE",
      createdAt: Math.floor(Date.now() / 1000),
      expiresAt,
    };
  });
  return { keyId, key };
}

export async function setKeyExpiry(jobId: string, expiresAt: number): Promise<void> {
  await withStore((d) => {
    if (d.keys[jobId]) d.keys[jobId].expiresAt = expiresAt;
  });
}

// Returns the key only while it is ACTIVE and not past its expiry.
export async function getActiveKey(jobId: string, now = Math.floor(Date.now() / 1000)): Promise<{ keyId: string; key: Buffer } | null> {
  const row = (await readStore()).keys[jobId];
  if (!row || row.state !== "ACTIVE" || !row.keyMaterial || row.expiresAt <= now) return null;
  return { keyId: row.keyId, key: Buffer.from(row.keyMaterial, "base64") };
}

export async function getKeyRow(jobId: string): Promise<KeyRow | null> {
  const row = (await readStore()).keys[jobId];
  return row ? { ...row, keyMaterial: row.keyMaterial ? "[redacted]" : null } : null;
}

function receiptHash(r: Omit<DestructionReceipt, "receiptHash" | "signer" | "signature">): string {
  return ethers.keccak256(
    ethers.toUtf8Bytes(
      JSON.stringify([r.version, r.jobId, r.keyId, r.expiryTimestamp, r.destructionTimestamp, r.status])
    )
  );
}

async function signReceipt(hash: string): Promise<{ signer: string; signature: string }> {
  const wallet = new ethers.Wallet(privateKeyFromEnv("ORACLE_PRIVATE_KEY"));
  return { signer: wallet.address, signature: await wallet.signMessage(ethers.getBytes(hash)) };
}

export function verifyDestructionReceipt(r: DestructionReceipt): boolean {
  const { receiptHash: h, signer, signature, ...rest } = r;
  if (receiptHash(rest) !== h) return false;
  return ethers.verifyMessage(ethers.getBytes(h), signature) === signer;
}

// Idempotent: safe to run on a timer and again on demand.
// ACTIVE -> EXPIRY_PENDING -> DESTROYED, with DESTRUCTION_FAILED retried next pass.
export async function destroyKey(jobId: string, now = Math.floor(Date.now() / 1000)): Promise<DestructionReceipt | null> {
  const before = (await readStore()).keys[jobId];
  if (!before) return null;
  if (before.state === "DESTROYED") return (await readStore()).receipts[jobId] ?? null;

  await withStore((d) => {
    if (d.keys[jobId]) d.keys[jobId].state = "EXPIRY_PENDING";
  });

  try {
    const base = {
      version: 1 as const,
      jobId,
      keyId: before.keyId,
      expiryTimestamp: before.expiresAt,
      destructionTimestamp: now,
      status: "destroyed" as const,
    };
    const hash = receiptHash(base);
    const sig = await signReceipt(hash);
    const receipt: DestructionReceipt = { ...base, receiptHash: hash, ...sig };

    await withStore((d) => {
      const row = d.keys[jobId];
      if (row) {
        // overwrite before dropping the material
        row.keyMaterial = "0".repeat((row.keyMaterial ?? "").length);
        row.keyMaterial = null;
        row.state = "DESTROYED";
      }
      d.receipts[jobId] = receipt;
    });
    return receipt;
  } catch (err) {
    await withStore((d) => {
      if (d.keys[jobId]) d.keys[jobId].state = "DESTRUCTION_FAILED";
    });
    throw err;
  }
}

export async function destroyExpiredKeys(now = Math.floor(Date.now() / 1000)): Promise<string[]> {
  const { keys } = await readStore();
  const due = Object.values(keys).filter(
    (k) => k.state !== "DESTROYED" && k.expiresAt <= now
  );
  const done: string[] = [];
  for (const k of due) {
    try {
      await destroyKey(k.jobId, now);
      done.push(k.jobId);
    } catch {
      // left as DESTRUCTION_FAILED; the next pass retries
    }
  }
  return done;
}
