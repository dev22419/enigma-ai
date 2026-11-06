// AI-assisted: Used Claude to write these tests.
import { beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";

// Minimal Web Storage for the node test environment (vault still uses sessionStorage for tokens + localStorage for receipts).
class MemStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}
const g = globalThis as unknown as { window: { sessionStorage: MemStorage }; localStorage: MemStorage };
g.window = { sessionStorage: new MemStorage() };
g.localStorage = new MemStorage();

const vault = await import("@/lib/client/vault");
const { hashContent } = await import("@/lib/oracle-signer");

beforeEach(async () => {
  g.window.sessionStorage.clear();
  g.localStorage.clear();
  // Clear IndexedDB between tests
  const dbs = await indexedDB.databases();
  for (const db of dbs) {
    if (db.name) indexedDB.deleteDatabase(db.name);
  }
  // Re-init the vault cache
  await vault.initVault();
});

describe("browser vault (task board #67-#76)", () => {
  it("hashes text exactly like the server", () => {
    const text = "CLINIC NOTE - demo patient 0002";
    expect(vault.hashText(text)).toBe(hashContent(text));
  });

  it("round-trips a result bound to its job", async () => {
    const { key, keyId } = await vault.newJobKey();
    const env = await vault.encryptText(key, keyId, "SUMMARY\n- fine", { jobId: "42", objectType: "result" });
    expect(env).not.toContain("SUMMARY");
    await expect(vault.decryptEnvelope(key, env, { jobId: "42", objectType: "result" })).resolves.toBe("SUMMARY\n- fine");
  });

  it("uses a fresh IV for every encryption", async () => {
    const { key, keyId } = await vault.newJobKey();
    const a = vault.parseEnvelope(await vault.encryptText(key, keyId, "same", { objectType: "input" }))!;
    const b = vault.parseEnvelope(await vault.encryptText(key, keyId, "same", { objectType: "input" }))!;
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it("rejects ciphertext bound to a different job", async () => {
    const { key, keyId } = await vault.newJobKey();
    const env = await vault.encryptText(key, keyId, "secret", { jobId: "42", objectType: "result" });
    await expect(vault.decryptEnvelope(key, env, { jobId: "43", objectType: "result" })).rejects.toThrow();
  });

  it("rejects tampered ciphertext or associated data", async () => {
    const { key, keyId } = await vault.newJobKey();
    const env = JSON.parse(await vault.encryptText(key, keyId, "secret", { jobId: "42", objectType: "result" }));
    const flipped = { ...env, ct: (env.ct[0] === "A" ? "B" : "A") + env.ct.slice(1) };
    await expect(vault.decryptEnvelope(key, JSON.stringify(flipped), { jobId: "42" })).rejects.toThrow();
    const rebound = { ...env, aad: { ...env.aad, objectType: "input" } };
    await expect(vault.decryptEnvelope(key, JSON.stringify(rebound), { jobId: "42" })).rejects.toThrow();
  });

  it("rejects the wrong key", async () => {
    const a = await vault.newJobKey();
    const b = await vault.newJobKey();
    const env = await vault.encryptText(a.key, a.keyId, "secret", { jobId: "42", objectType: "result" });
    await expect(vault.decryptEnvelope(b.key, env, { jobId: "42", objectType: "result" })).rejects.toThrow();
  });

  it("keeps the key across a reload, then wipes it for good with a receipt", async () => {
    const { key, keyId } = await vault.newJobKey();
    const env = await vault.encryptText(key, keyId, "secret", { jobId: "7", objectType: "result" });
    await vault.storeKey("7", key, keyId, Math.floor(Date.now() / 1000) + 600);

    const reloaded = await vault.loadKey("7");
    expect(reloaded?.keyId).toBe(keyId);
    await expect(vault.decryptEnvelope(reloaded!.key, env, { jobId: "7", objectType: "result" })).resolves.toBe("secret");

    const receipt = await vault.wipeKey("7", 1_800_000_000);
    expect(receipt).toMatchObject({ jobId: "7", keyId, expiryTimestamp: 1_800_000_000, status: "wiped" });
    expect(receipt!.receiptHash).toMatch(/^0x[0-9a-f]{64}$/);

    expect(vault.hasKey("7")).toBe(false);
    expect(await vault.loadKey("7")).toBeNull();
    expect(vault.loadWipeReceipt("7")).toEqual(receipt);
    expect(await vault.wipeKey("7", 1)).toEqual(receipt); // idempotent
  });

  it("fails closed: an expired key is wiped on load and never used", async () => {
    const { key, keyId } = await vault.newJobKey();
    await vault.storeKey("8", key, keyId, Math.floor(Date.now() / 1000) - 1);
    expect(await vault.loadKey("8")).toBeNull();
    expect(vault.hasKey("8")).toBe(false);
    expect(vault.loadWipeReceipt("8")?.status).toBe("wiped");
  });

  it("wipes expired keys found in storage even when no job list points to them", async () => {
    const a = await vault.newJobKey();
    const b = await vault.newJobKey();
    const now = Math.floor(Date.now() / 1000);
    await vault.storeKey("old", a.key, a.keyId, now - 5);
    await vault.storeKey("live", b.key, b.keyId, now + 600);
    expect(await vault.wipeExpiredKeys(now)).toBe(1); // only "old" is expired
    expect(vault.hasKey("old")).toBe(false);
    expect(vault.hasKey("live")).toBe(true);
  });

  it("wipes every key when the job list is cleared", async () => {
    const a = await vault.newJobKey();
    await vault.storeKey("9", a.key, a.keyId, Math.floor(Date.now() / 1000) + 600);
    await vault.wipeAllKeys();
    expect(vault.hasKey("9")).toBe(false);
  });
});
