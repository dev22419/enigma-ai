// AI-assisted: Used Claude to draft these tests
//
// #61. Envelope tampering must fail authentication; an oracle signature must only verify for the
// exact job and result it was made for. (The contract enforces the signature check on-chain; its
// Hardhat tests cover rejection there. These cover the backend half.)
import { beforeEach, describe, expect, it } from "vitest";
import { ethers } from "ethers";
import { decrypt, encrypt, newJobKey, newKeyId, parseEnvelope, serializeEnvelope, type Envelope } from "@/lib/crypto";
import { signJobCompletion } from "@/lib/oracle-signer";
import { WHITECHAIN_CHAIN_ID } from "@/lib/constants";

const aad = { jobId: "7", objectType: "result" as const };
const flip = (b64: string, i = 0) => {
  const buf = Buffer.from(b64, "base64");
  buf[i] ^= 0x01;
  return buf.toString("base64");
};

describe("envelope tampering fails authentication", () => {
  const key = newJobKey();
  const keyId = newKeyId();
  const env = encrypt(key, keyId, "diagnosis: confidential", aad);

  it("accepts the untouched envelope, also after a JSON round trip", () => {
    expect(decrypt(key, parseEnvelope(serializeEnvelope(env)), aad).toString()).toBe("diagnosis: confidential");
  });

  it.each([
    ["ciphertext", (e: Envelope): Envelope => ({ ...e, ciphertext: flip(e.ciphertext) })],
    ["nonce", (e: Envelope): Envelope => ({ ...e, nonce: flip(e.nonce) })],
    ["tag", (e: Envelope): Envelope => ({ ...e, tag: flip(e.tag) })],
    ["keyId (bound into the AAD)", (e: Envelope): Envelope => ({ ...e, keyId: "key-0000000000000000" })],
    ["truncated ciphertext", (e: Envelope): Envelope => ({ ...e, ciphertext: Buffer.from(e.ciphertext, "base64").subarray(1).toString("base64") })],
    ["truncated tag", (e: Envelope): Envelope => ({ ...e, tag: Buffer.from(e.tag, "base64").subarray(0, 8).toString("base64") })],
    ["nonce length", (e: Envelope): Envelope => ({ ...e, nonce: Buffer.alloc(16, 1).toString("base64") })],
    ["empty tag", (e: Envelope): Envelope => ({ ...e, tag: "" })],
  ])("rejects a modified %s", (_name, mutate) => {
    expect(() => decrypt(key, mutate(env), aad)).toThrow();
  });

  it("rejects an unsupported version or algorithm", () => {
    expect(() => decrypt(key, { ...env, version: 2 as unknown as 1 }, aad)).toThrow("Unsupported envelope");
    expect(() => decrypt(key, { ...env, algorithm: "AES-128-CBC" as unknown as "AES-256-GCM" }, aad)).toThrow("Unsupported envelope");
  });

  it("rejects the right ciphertext presented for the wrong job or object type", () => {
    expect(() => decrypt(key, env, { jobId: "8", objectType: "result" })).toThrow();
    expect(() => decrypt(key, env, { jobId: "7", objectType: "input" })).toThrow();
  });

  it("never reuses a nonce across many encryptions under one key", () => {
    const nonces = new Set(Array.from({ length: 2000 }, () => encrypt(key, keyId, "x", aad).nonce));
    expect(nonces.size).toBe(2000);
  });

  it("gives the result a different nonce than the input of the same job", () => {
    const input = encrypt(key, keyId, "doc", { jobId: "7", objectType: "input" });
    const result = encrypt(key, keyId, "res", { jobId: "7", objectType: "result" });
    expect(input.nonce).not.toBe(result.nonce);
  });
});

describe("oracle completion signature binds the job and the result", () => {
  const oracle = ethers.Wallet.createRandom();
  const contract = ethers.Wallet.createRandom().address;
  const user = ethers.Wallet.createRandom().address;
  const fileHash = ethers.keccak256(ethers.toUtf8Bytes("file"));
  const resultHash = ethers.keccak256(ethers.toUtf8Bytes("result"));
  const attestationHash = ethers.keccak256(ethers.toUtf8Bytes("attestation"));
  const domain = { name: "EnigmaAI", version: "1", chainId: WHITECHAIN_CHAIN_ID, verifyingContract: contract };
  const types = {
    Complete: [
      { name: "jobId", type: "uint256" },
      { name: "user", type: "address" },
      { name: "fileHash", type: "bytes32" },
      { name: "resultHash", type: "bytes32" },
      { name: "attestationHash", type: "bytes32" },
    ],
  };

  beforeEach(() => {
    process.env.ORACLE_PRIVATE_KEY = oracle.privateKey;
    process.env.CONTRACT_ADDRESS = contract;
  });

  const recover = (sig: string, over: Partial<Record<string, unknown>> = {}) =>
    ethers.verifyTypedData(domain, types, { jobId: BigInt(1), user, fileHash, resultHash, attestationHash, ...over }, sig);

  it("recovers to the oracle for exactly the signed values", async () => {
    const sig = await signJobCompletion({ jobId: BigInt(1), user, fileHash, resultHash, attestationHash });
    expect(recover(sig)).toBe(oracle.address);
  });

  it("does not recover to the oracle for another job, user, file, result or attestation", async () => {
    const sig = await signJobCompletion({ jobId: BigInt(1), user, fileHash, resultHash, attestationHash });
    const other = ethers.keccak256(ethers.toUtf8Bytes("other"));
    expect(recover(sig, { jobId: BigInt(2) })).not.toBe(oracle.address);
    expect(recover(sig, { user: ethers.Wallet.createRandom().address })).not.toBe(oracle.address);
    expect(recover(sig, { fileHash: other })).not.toBe(oracle.address);
    expect(recover(sig, { resultHash: other })).not.toBe(oracle.address);
    expect(recover(sig, { attestationHash: other })).not.toBe(oracle.address);
  });

  it("is bound to the contract address (no replay against another deployment)", async () => {
    const sig = await signJobCompletion({ jobId: BigInt(1), user, fileHash, resultHash, attestationHash });
    const elsewhere = { ...domain, verifyingContract: ethers.Wallet.createRandom().address };
    const who = ethers.verifyTypedData(elsewhere, types, { jobId: BigInt(1), user, fileHash, resultHash, attestationHash }, sig);
    expect(who).not.toBe(oracle.address);
  });

  it("refuses to sign without a configured contract or a valid oracle key", async () => {
    delete process.env.CONTRACT_ADDRESS;
    await expect(signJobCompletion({ jobId: BigInt(1), user, fileHash, resultHash, attestationHash })).rejects.toThrow("CONTRACT_ADDRESS");
    process.env.CONTRACT_ADDRESS = contract;
    process.env.ORACLE_PRIVATE_KEY = "oops";
    await expect(signJobCompletion({ jobId: BigInt(1), user, fileHash, resultHash, attestationHash })).rejects.toThrow("ORACLE_PRIVATE_KEY");
  });
});
