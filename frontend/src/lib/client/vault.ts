// AI-assisted: Used Claude to write this file.
"use client";

import { ethers } from "ethers";

/**
 * The browser's half of Enigma's zero-storage design (task board #67, #68, #69, #72, #74, #75).
 *
 * - One AES-256-GCM key per job, generated here with Web Crypto. The server never sees it.
 * - The document and the answer are each encrypted with that key under a fresh 96-bit IV,
 *   with associated data that binds the ciphertext to what it is (input vs result, which job).
 * - The key lives in sessionStorage (so a refresh can still read the answer) and nowhere else.
 * - At expiry the key is wiped, and a destruction receipt without any key material is kept.
 */

const KEY_PREFIX = "enigma.key.";
const TOKEN_PREFIX = "enigma.token.";
const RECEIPT_PREFIX = "enigma.wiped.";

export interface Envelope {
  v: 1;
  alg: "AES-256-GCM";
  keyId: string;
  iv: string; // base64
  ct: string; // base64, ciphertext with the GCM tag appended
  aad: Record<string, string>;
}

export interface WipeReceipt {
  jobId: string;
  keyId: string;
  expiryTimestamp: number; // seconds
  destructionTimestamp: number; // seconds
  status: "wiped";
  receiptHash: string; // keccak256 of the fields above
}

// ------------------------------------------------------------------ encoding

function toB64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(b64: string) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Canonical bytes for associated data: keys sorted, so both sides agree. */
function aadBytes(aad: Record<string, string>) {
  return enc.encode(JSON.stringify(Object.keys(aad).sort().map((k) => [k, aad[k]])));
}

function randomId() {
  return toB64(crypto.getRandomValues(new Uint8Array(12))).replace(/[+/=]/g, "").slice(0, 16);
}

// ------------------------------------------------------------------ keys and hashing

/** Same hash the server uses (hashContent): keccak256 over the UTF-8 text. */
export function hashText(content: string) {
  return ethers.keccak256(ethers.toUtf8Bytes(content));
}

export async function newJobKey() {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  return { key, keyId: `k_${randomId()}` };
}

export async function encryptText(key: CryptoKey, keyId: string, plaintext: string, aad: Record<string, string>): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aadBytes(aad) }, key, enc.encode(plaintext)));
  const envelope: Envelope = { v: 1, alg: "AES-256-GCM", keyId, iv: toB64(iv), ct: toB64(ct), aad };
  return JSON.stringify(envelope);
}

export function parseEnvelope(json: string): Envelope | null {
  try {
    const e = JSON.parse(json) as Envelope;
    return e && e.v === 1 && e.alg === "AES-256-GCM" && typeof e.iv === "string" && typeof e.ct === "string" ? e : null;
  } catch {
    return null;
  }
}

/** Decrypts, checking the envelope is bound to what we expect. Throws if the key, tag or binding is wrong. */
export async function decryptEnvelope(key: CryptoKey, json: string, expect: Record<string, string>): Promise<string> {
  const e = parseEnvelope(json);
  if (!e) throw new Error("Not an Enigma ciphertext envelope");
  for (const [k, v] of Object.entries(expect)) {
    if (e.aad[k] !== v) throw new Error(`Ciphertext is bound to a different ${k}`);
  }
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(e.iv), additionalData: aadBytes(e.aad) }, key, fromB64(e.ct));
  return dec.decode(pt);
}

// ------------------------------------------------------------------ session storage

function session(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Stores the key with the time it must be gone by (seconds). The wiper uses this, not the job list. */
export async function storeKey(jobId: string, key: CryptoKey, keyId: string, expiresAt: number) {
  const jwk = await crypto.subtle.exportKey("jwk", key);
  session()?.setItem(KEY_PREFIX + jobId, JSON.stringify({ keyId, jwk, expiresAt }));
}

/** Moves a key's deadline to the real one once Arkiv reports it. Never extends past what's stored if later. */
export function setKeyExpiry(jobId: string, expiresAt: number) {
  const s = session();
  const raw = s?.getItem(KEY_PREFIX + jobId);
  if (!raw) return;
  try {
    const row = JSON.parse(raw) as { keyId: string; jwk: JsonWebKey; expiresAt?: number };
    s?.setItem(KEY_PREFIX + jobId, JSON.stringify({ ...row, expiresAt }));
  } catch {
    /* unreadable row: leave it for the wiper */
  }
}

/** The job's key, if this browser session still holds it. */
export async function loadKey(jobId: string): Promise<{ key: CryptoKey; keyId: string } | null> {
  const raw = session()?.getItem(KEY_PREFIX + jobId);
  if (!raw) return null;
  try {
    const { keyId, jwk, expiresAt } = JSON.parse(raw) as { keyId: string; jwk: JsonWebKey; expiresAt?: number };
    // Fail closed: a key past its deadline is wiped on sight, never used.
    if (!expiresAt || Date.now() / 1000 >= expiresAt) {
      wipeKey(jobId, expiresAt ?? Math.floor(Date.now() / 1000));
      return null;
    }
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    return { key, keyId };
  } catch {
    return null;
  }
}

/** Every job id whose key this session holds, read from storage itself (not from the job list). */
function heldJobIds(): string[] {
  const s = session();
  if (!s) return [];
  const ids: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k?.startsWith(KEY_PREFIX)) ids.push(k.slice(KEY_PREFIX.length));
  }
  return ids;
}

/** Wipes every key whose deadline has passed, or that has no readable deadline (task #74, fail closed). */
export function wipeExpiredKeys(nowSec = Math.floor(Date.now() / 1000)) {
  let wiped = 0;
  for (const id of heldJobIds()) {
    let exp: number | undefined;
    try {
      exp = (JSON.parse(session()?.getItem(KEY_PREFIX + id) ?? "{}") as { expiresAt?: number }).expiresAt;
    } catch {
      exp = undefined;
    }
    if (!exp || nowSec >= exp) {
      if (wipeKey(id, exp ?? nowSec)) wiped++;
    }
  }
  return wiped;
}

/** Wipes every key in this session, e.g. when the user clears their job list. */
export function wipeAllKeys() {
  const nowSec = Math.floor(Date.now() / 1000);
  for (const id of heldJobIds()) wipeKey(id, nowSec);
}

export function hasKey(jobId: string) {
  return !!session()?.getItem(KEY_PREFIX + jobId);
}

export function storeToken(jobId: string, token: string) {
  session()?.setItem(TOKEN_PREFIX + jobId, token);
}

export function loadToken(jobId: string) {
  return session()?.getItem(TOKEN_PREFIX + jobId) ?? null;
}

// ------------------------------------------------------------------ destruction

/**
 * Wipes the job's key from this browser and keeps a receipt of it (no key material).
 * Idempotent: a second call returns the first receipt.
 */
export function wipeKey(jobId: string, expiryTimestamp: number): WipeReceipt | null {
  const existing = loadWipeReceipt(jobId);
  if (existing) return existing;
  const s = session();
  const raw = s?.getItem(KEY_PREFIX + jobId);
  if (!raw) return null;
  let keyId = "unknown";
  try {
    keyId = (JSON.parse(raw) as { keyId: string }).keyId;
  } catch {
    /* keep going: the wipe matters more than the id */
  }
  s?.removeItem(KEY_PREFIX + jobId);
  const base = { jobId, keyId, expiryTimestamp, destructionTimestamp: Math.floor(Date.now() / 1000), status: "wiped" as const };
  const receipt: WipeReceipt = { ...base, receiptHash: hashText(JSON.stringify([base.jobId, base.keyId, base.expiryTimestamp, base.destructionTimestamp, base.status])) };
  try {
    localStorage.setItem(RECEIPT_PREFIX + jobId, JSON.stringify(receipt));
  } catch {
    /* the key is gone either way */
  }
  return receipt;
}

export function loadWipeReceipt(jobId: string): WipeReceipt | null {
  try {
    const raw = localStorage.getItem(RECEIPT_PREFIX + jobId);
    return raw ? (JSON.parse(raw) as WipeReceipt) : null;
  } catch {
    return null;
  }
}
