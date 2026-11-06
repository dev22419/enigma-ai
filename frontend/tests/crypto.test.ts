import { describe, it, expect } from "vitest";
import { decrypt, encrypt, newJobKey, newKeyId } from "@/lib/crypto";

const aad = { jobId: "42", objectType: "result" as const };

describe("AES-256-GCM envelope", () => {
  it("round-trips", () => {
    const key = newJobKey();
    const env = encrypt(key, newKeyId(), "High cholesterol detected", aad);
    expect(decrypt(key, env, aad).toString()).toBe("High cholesterol detected");
  });

  it("uses a fresh nonce for every call", () => {
    const key = newJobKey();
    const id = newKeyId();
    expect(encrypt(key, id, "x", aad).nonce).not.toBe(encrypt(key, id, "x", aad).nonce);
  });

  it("fails with the wrong key", () => {
    const env = encrypt(newJobKey(), newKeyId(), "secret", aad);
    expect(() => decrypt(newJobKey(), env, aad)).toThrow();
  });

  it("detects a flipped ciphertext bit", () => {
    const key = newJobKey();
    const env = encrypt(key, newKeyId(), "secret", aad);
    const buf = Buffer.from(env.ciphertext, "base64");
    buf[0] ^= 1;
    expect(() => decrypt(key, { ...env, ciphertext: buf.toString("base64") }, aad)).toThrow();
  });

  it("rejects a blob moved to another job or object type", () => {
    const key = newJobKey();
    const env = encrypt(key, newKeyId(), "secret", aad);
    expect(() => decrypt(key, env, { jobId: "43", objectType: "result" })).toThrow();
    expect(() => decrypt(key, env, { jobId: "42", objectType: "input" })).toThrow();
    // relabelling the envelope's own AAD must also fail authentication
    expect(() =>
      decrypt(key, { ...env, aad: { jobId: "43", objectType: "result" } }, { jobId: "43", objectType: "result" })
    ).toThrow();
  });
});
