// AI-assisted: Used Claude to write this file.
import { ethers } from "ethers";
import { AUTH_MAX_WINDOW_SECONDS, buildAuthMessage } from "./auth-message";
import { WHITECHAIN_CHAIN_ID } from "./constants";
import { getQueryPrice } from "./contract";
import { withStore } from "./store";

export interface JobAuthInput {
  userAddress: string;
  fileHash: string;
  ttl: number;
  signature?: unknown;
  nonce?: unknown;
  validUntil?: unknown;
}

export type JobAuthResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * Proves the caller controls `userAddress` before the backend charges that wallet's balance
 * (createJobFor). The wallet signs a message bound to this exact job; the signature works once.
 */
export async function verifyJobAuth(i: JobAuthInput, now = Math.floor(Date.now() / 1000)): Promise<JobAuthResult> {
  if (typeof i.signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(i.signature)) {
    return { ok: false, status: 401, error: "A wallet signature is required to spend from a balance" };
  }
  if (typeof i.nonce !== "string" || !/^0x[0-9a-fA-F]{32}$/.test(i.nonce)) {
    return { ok: false, status: 400, error: "nonce must be 16 random bytes as 0x-prefixed hex" };
  }
  if (typeof i.validUntil !== "number" || !Number.isInteger(i.validUntil)) {
    return { ok: false, status: 400, error: "validUntil must be a whole number of unix seconds" };
  }
  if (i.validUntil <= now) return { ok: false, status: 401, error: "The signed authorization has expired. Sign again." };
  if (i.validUntil > now + AUTH_MAX_WINDOW_SECONDS) {
    return { ok: false, status: 400, error: `validUntil is more than ${AUTH_MAX_WINDOW_SECONDS} seconds ahead` };
  }

  const price = await getQueryPrice();
  const message = buildAuthMessage({
    userAddress: i.userAddress,
    fileHash: i.fileHash,
    ttl: i.ttl,
    price,
    validUntil: i.validUntil,
    nonce: i.nonce,
    contract: process.env.CONTRACT_ADDRESS ?? "",
    chainId: WHITECHAIN_CHAIN_ID,
  });

  let signer = "";
  try {
    signer = ethers.verifyMessage(message, i.signature);
  } catch {
    return { ok: false, status: 403, error: "The signature is not valid" };
  }
  if (signer.toLowerCase() !== i.userAddress.toLowerCase()) {
    return { ok: false, status: 403, error: "The signature doesn't match userAddress, this job's details or the current price" };
  }

  // One use per signature. Expired entries are dropped as we go, so the table stays small.
  const digest = ethers.keccak256(ethers.toUtf8Bytes(message));
  const fresh = await withStore((d) => {
    d.auth ??= {};
    for (const [k, until] of Object.entries(d.auth)) if (until <= now) delete d.auth[k];
    if (d.auth[digest]) return false;
    d.auth[digest] = i.validUntil as number;
    return true;
  });
  if (!fresh) return { ok: false, status: 409, error: "This authorization was already used. Sign again." };
  return { ok: true };
}
