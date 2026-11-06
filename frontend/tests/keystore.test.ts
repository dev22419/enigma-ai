import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ethers } from "ethers";
import { decrypt, encrypt } from "@/lib/crypto";
import {
  createKey, destroyExpiredKeys, destroyKey, getActiveKey, verifyDestructionReceipt,
} from "@/lib/keystore";
import { readStore } from "@/lib/store";

beforeEach(() => {
  process.env.ENIGMA_DATA_DIR = mkdtempSync(path.join(tmpdir(), "enigma-"));
  process.env.ORACLE_PRIVATE_KEY = ethers.Wallet.createRandom().privateKey;
});

const now = () => Math.floor(Date.now() / 1000);

describe("key lifecycle", () => {
  it("serves the key before expiry and not after", async () => {
    await createKey("1", now() + 100);
    expect(await getActiveKey("1")).not.toBeNull();
    expect(await getActiveKey("1", now() + 101)).toBeNull();
  });

  it("destroys only expired keys, signs a receipt, and clears the material", async () => {
    await createKey("1", now() - 1);
    await createKey("2", now() + 1000);
    expect(await destroyExpiredKeys()).toEqual(["1"]);

    const s = await readStore();
    expect(s.keys["1"].state).toBe("DESTROYED");
    expect(s.keys["1"].keyMaterial).toBeNull();
    expect(s.keys["2"].state).toBe("ACTIVE");
    expect(verifyDestructionReceipt(s.receipts["1"])).toBe(true);
    expect(JSON.stringify(s.receipts["1"])).not.toContain("keyMaterial");
  });

  it("is idempotent", async () => {
    await createKey("1", now() - 1);
    const first = await destroyKey("1");
    const second = await destroyKey("1");
    expect(second?.receiptHash).toBe(first?.receiptHash);
    expect(await destroyExpiredKeys()).toEqual([]);
  });

  it("makes ciphertext undecryptable once the key is gone", async () => {
    const { keyId, key } = await createKey("7", now() - 1);
    const aad = { jobId: "7", objectType: "result" as const };
    const env = encrypt(key, keyId, "patient result", aad);
    expect(decrypt(key, env, aad).toString()).toBe("patient result");

    await destroyExpiredKeys();
    expect(await getActiveKey("7")).toBeNull();
    expect((await readStore()).keys["7"].keyMaterial).toBeNull();
  });

  it("detects a tampered receipt", async () => {
    await createKey("1", now() - 1);
    const r = (await destroyKey("1"))!;
    expect(verifyDestructionReceipt({ ...r, destructionTimestamp: r.destructionTimestamp + 5 })).toBe(false);
  });
});
