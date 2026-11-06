// Kill-switch test: does a short-lived Arkiv entity really disappear?
// Needs ORACLE_PRIVATE_KEY (in ../.env) funded on Arkiv Rabdi: https://hub.arkiv.network/faucet
// Usage: npx tsx scripts/smoke-arkiv.mts [ttlSeconds]
import { privateKeyToAccount } from "viem/accounts";
import { privateKeyFromEnv } from "../src/lib/env";
import { storeInArkiv, fetchFromArkiv } from "../src/lib/arkiv";
process.loadEnvFile("../.env");

console.log("writer address:", privateKeyToAccount(privateKeyFromEnv("ORACLE_PRIVATE_KEY")).address);
const ttl = Number(process.argv[2] ?? 60);
const id = `smoke-${Date.now()}`;
const t0 = Math.floor(Date.now() / 1000);

const w = await storeInArkiv(id, JSON.stringify({ hello: "ciphertext-stand-in" }), ttl);
console.log("written", w.entityKey, "tx", w.txHash, "expiresAt", w.expiresAtUnix, `(+${w.expiresAtUnix - t0}s from now)`);

const r1 = await fetchFromArkiv(id);
console.log("read right after write:", r1.exists, r1.expiresAtUnix);

const wait = Math.max(0, w.expiresAtUnix - Math.floor(Date.now() / 1000)) + 8;
console.log(`waiting ${wait}s past expiry...`);
await new Promise((r) => setTimeout(r, wait * 1000));

const r2 = await fetchFromArkiv(id);
console.log("read after expiry:", r2.exists ? "STILL THERE (claim fails)" : "GONE (claim holds)");
