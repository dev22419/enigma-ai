// AI-assisted: Used Claude to write this script.
//
// E2E live test: runs the full Enigma pipeline against real testnets.
// Needs ZG_API_KEY, DEPLOYER_PRIVATE_KEY, ARKIV_ACCESS_KEY (in ../.env).
// Usage: npx tsx scripts/e2e-live.mts
//
// What it tests:
//   1. 0G inference (private trust mode, TEE-only) — real model call
//   2. Arkiv storage — write ciphertext, read it back, verify expiry
//   3. Whitechain RPC — read chain id + contract code
//   4. AES-256-GCM encrypt/decrypt round-trip (Node's WebCrypto)

import { runInference } from "../src/lib/og-inference";
import { storeInArkiv, fetchFromArkiv } from "../src/lib/arkiv";
import { ethers } from "ethers";
process.loadEnvFile("../.env");

const pass = (label: string) => console.log(`  ✓ ${label}`);
const fail = (label: string, err: unknown) => {
  console.log(`  ✗ ${label}: ${err instanceof Error ? err.message : err}`);
  failures++;
};
let failures = 0;

console.log("═══ Enigma E2E live test ═══\n");

// ──────────────────── 1. 0G inference ────────────────────
console.log("1. 0G TEE inference (private trust mode)");
try {
  const t0 = Date.now();
  const r = await runInference(
    "Patient: Test Subject, DOB 01/01/1990. BP 120/80. No complaints. Follow-up in 6 months.",
  );
  const ms = Date.now() - t0;
  if (!r.content || r.content.length < 20) throw new Error("response too short");
  if (!r.chatId) throw new Error("no chatId");
  pass(`model=${r.model}  chatId=${r.chatId.slice(0, 20)}…  ${ms}ms`);
  pass(`finish_reason=${r.finishReason}  content_length=${r.content.length}`);
  if (r.provider) pass(`provider=${r.provider.slice(0, 16)}…`);
  if (r.content.toLowerCase().includes("summary")) {
    pass("response contains SUMMARY section");
  } else {
    fail("response format", "expected SUMMARY heading");
  }
} catch (e) {
  fail("0G inference", e);
}

// ──────────────────── 2. AES-256-GCM round-trip ────────────────────
console.log("\n2. AES-256-GCM encrypt/decrypt round-trip");
try {
  const { subtle } = globalThis.crypto;
  const key = await subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const plaintext = "Confidential: this text should round-trip through AES-256-GCM.";
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  const pt = new TextDecoder().decode(await subtle.decrypt({ name: "AES-GCM", iv }, key, ct));
  if (pt !== plaintext) throw new Error("decrypt mismatch");
  pass(`plaintext=${plaintext.length}B  ciphertext=${ct.byteLength}B`);
} catch (e) {
  fail("AES-256-GCM", e);
}

// ──────────────────── 3. Arkiv write + read ────────────────────
console.log("\n3. Arkiv Rabdi (write, read-back)");
try {
  const jobId = `e2e-${Date.now()}`;
  const envelope = JSON.stringify({ v: 1, kid: "e2e-test", ct: crypto.getRandomValues(new Uint8Array(64)).toString() });
  const w = await storeInArkiv(jobId, envelope, 120);
  if (!w.entityKey) throw new Error("no entityKey");
  pass(`written entityKey=${w.entityKey.slice(0, 16)}…  expiresAt=${w.expiresAtUnix}`);

  const r = await fetchFromArkiv(jobId);
  if (!r.exists) throw new Error("entity not found after write");
  if (!r.envelopeJson?.includes("e2e-test")) throw new Error("read-back mismatch");
  pass("read-back matches");
} catch (e) {
  fail("Arkiv", e);
}

// ──────────────────── 4. Whitechain RPC ────────────────────
console.log("\n4. Whitechain testnet RPC");
try {
  const provider = new ethers.JsonRpcProvider("https://rpc.ankr.com/whitechain_testnet");
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== 1874) throw new Error(`wrong chain: ${network.chainId}`);
  pass(`chainId=${network.chainId}`);

  const contractAddr = process.env.CONTRACT_ADDRESS ?? "0xB4491c1eBE47447661B0e1266e19f3B2D32A226f";
  const code = await provider.getCode(contractAddr);
  if (!code || code === "0x") throw new Error("no code at contract address");
  pass(`contract at ${contractAddr.slice(0, 10)}…  code_length=${code.length}`);
} catch (e) {
  fail("Whitechain RPC", e);
}

// ──────────────────── 5. 0G testnet RPC ────────────────────
console.log("\n5. 0G testnet RPC");
try {
  const provider = new ethers.JsonRpcProvider("https://evmrpc-testnet.0g.ai");
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== 16602) throw new Error(`wrong chain: ${network.chainId}`);
  pass(`chainId=${network.chainId}`);

  const block = await provider.getBlockNumber();
  pass(`latest block=${block}`);
} catch (e) {
  fail("0G testnet RPC", e);
}

// ──────────────────── Summary ────────────────────
console.log(`\n═══ ${failures === 0 ? "ALL PASSED" : `${failures} FAILURE(S)`} ═══`);
process.exit(failures > 0 ? 1 : 0);
