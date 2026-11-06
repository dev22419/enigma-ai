// AI-assisted: Used Claude to write this file.
"use client";

import { ethers } from "ethers";

/**
 * The browser's half of Enigma's zero-storage design (task board #67, #68, #69, #72, #74, #75).
 *
 * - One AES-256-GCM key per job, generated here with Web Crypto. The server never sees it.
 * - The document and the answer are each encrypted with that key under a fresh 96-bit IV,
 *   with associated data that binds the ciphertext to what it is (input vs result, which job).
 * - Keys are NON-EXTRACTABLE CryptoKey objects stored in IndexedDB — JS can use them
 *   for encrypt/decrypt but can never read the raw key bytes, even under XSS.
 * - At expiry the key is deleted from IndexedDB, and a destruction receipt is kept in localStorage.
 */

const DB_NAME = "enigma-vault";
const DB_VERSION = 1;
const KEY_STORE = "keys";

const TOKEN_PREFIX = "enigma.token.";
const RECEIPT_PREFIX = "enigma.wiped.";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(KEY_STORE)) {
          db.createObjectStore(KEY_STORE, { keyPath: "jobId" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

function idbGet<T>(db: IDBDatabase, store: string, id: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(id);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, store: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const req = tx.objectStore(store).put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db: IDBDatabase, store: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const req = tx.objectStore(store).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbAllKeys(db: IDBDatabase, store: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAllKeys();
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror = () => reject(req.error);
  });
}

interface KeyRecord {
  jobId: string;
  key: CryptoKey;
  keyId: string;
  expiresAt: number;
}

/** Sync cache of held job IDs so render-path code can check without await. */
const heldKeys = new Set<string>();
let cacheReady = false;

/** Populates the sync cache from IndexedDB. Call once on app mount. */
export async function initVault() {
  if (cacheReady) return;
  try {
    const db = await openDB();
    const ids = await idbAllKeys(db, KEY_STORE);
    for (const id of ids) heldKeys.add(id);
    db.close();
    cacheReady = true;
  } catch {
    /* IndexedDB unavailable — cache stays empty, fail closed */
  }
}

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
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
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

// ------------------------------------------------------------------ IndexedDB key storage

function session(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Stores a non-extractable CryptoKey in IndexedDB with its expiry deadline. */
export async function storeKey(jobId: string, key: CryptoKey, keyId: string, expiresAt: number) {
  const db = await openDB();
  await idbPut(db, KEY_STORE, { jobId, key, keyId, expiresAt } satisfies KeyRecord);
  db.close();
  heldKeys.add(jobId);
}

/** Moves a key's deadline to the real one once Arkiv reports it. */
export async function setKeyExpiry(jobId: string, expiresAt: number) {
  try {
    const db = await openDB();
    const row = await idbGet<KeyRecord>(db, KEY_STORE, jobId);
    if (row) {
      await idbPut(db, KEY_STORE, { ...row, expiresAt });
    }
    db.close();
  } catch {
    /* unreadable row: leave it for the wiper */
  }
}

/** The job's key, if this browser still holds it. Fail-closed: expired keys are wiped on sight. */
export async function loadKey(jobId: string): Promise<{ key: CryptoKey; keyId: string } | null> {
  try {
    const db = await openDB();
    const row = await idbGet<KeyRecord>(db, KEY_STORE, jobId);
    db.close();
    if (!row) return null;
    if (!row.expiresAt || Date.now() / 1000 >= row.expiresAt) {
      await wipeKey(jobId, row.expiresAt ?? Math.floor(Date.now() / 1000));
      return null;
    }
    return { key: row.key, keyId: row.keyId };
  } catch {
    return null;
  }
}

/** Every job id whose key this browser holds. */
async function heldJobIds(): Promise<string[]> {
  try {
    const db = await openDB();
    const keys = await idbAllKeys(db, KEY_STORE);
    db.close();
    return keys;
  } catch {
    return [];
  }
}

/** Wipes every key whose deadline has passed, or that has no readable deadline (fail closed). */
export async function wipeExpiredKeys(nowSec = Math.floor(Date.now() / 1000)) {
  let wiped = 0;
  try {
    const db = await openDB();
    const ids = await idbAllKeys(db, KEY_STORE);
    for (const id of ids) {
      const row = await idbGet<KeyRecord>(db, KEY_STORE, id);
      if (!row || !row.expiresAt || nowSec >= row.expiresAt) {
        await idbDelete(db, KEY_STORE, id);
        heldKeys.delete(id);
        const exp = row?.expiresAt ?? nowSec;
        const keyId = row?.keyId ?? "unknown";
        saveWipeReceipt(id, keyId, exp);
        wiped++;
      }
    }
    db.close();
  } catch {
    /* best-effort sweep */
  }
  return wiped;
}

/** Wipes every key in this browser, e.g. when the user clears their job list. */
export async function wipeAllKeys() {
  const nowSec = Math.floor(Date.now() / 1000);
  for (const id of await heldJobIds()) await wipeKey(id, nowSec);
}

/** Sync check using the in-memory cache. Call initVault() on app mount to populate. */
export function hasKey(jobId: string) {
  return heldKeys.has(jobId);
}

export function storeToken(jobId: string, token: string) {
  session()?.setItem(TOKEN_PREFIX + jobId, token);
}

export function loadToken(jobId: string) {
  return session()?.getItem(TOKEN_PREFIX + jobId) ?? null;
}

// ------------------------------------------------------------------ destruction

function saveWipeReceipt(jobId: string, keyId: string, expiryTimestamp: number): WipeReceipt {
  const base = { jobId, keyId, expiryTimestamp, destructionTimestamp: Math.floor(Date.now() / 1000), status: "wiped" as const };
  const receipt: WipeReceipt = { ...base, receiptHash: hashText(JSON.stringify([base.jobId, base.keyId, base.expiryTimestamp, base.destructionTimestamp, base.status])) };
  try {
    localStorage.setItem(RECEIPT_PREFIX + jobId, JSON.stringify(receipt));
  } catch {
    /* the key is gone either way */
  }
  return receipt;
}

/**
 * Wipes the job's key from IndexedDB and keeps a receipt in localStorage.
 * Idempotent: a second call returns the first receipt.
 */
export async function wipeKey(jobId: string, expiryTimestamp: number): Promise<WipeReceipt | null> {
  const existing = loadWipeReceipt(jobId);
  if (existing) return existing;
  try {
    const db = await openDB();
    const row = await idbGet<KeyRecord>(db, KEY_STORE, jobId);
    if (!row) { db.close(); return null; }
    await idbDelete(db, KEY_STORE, jobId);
    db.close();
    heldKeys.delete(jobId);
    return saveWipeReceipt(jobId, row.keyId ?? "unknown", expiryTimestamp);
  } catch {
    return null;
  }
}

export function loadWipeReceipt(jobId: string): WipeReceipt | null {
  try {
    const raw = localStorage.getItem(RECEIPT_PREFIX + jobId);
    return raw ? (JSON.parse(raw) as WipeReceipt) : null;
  } catch {
    return null;
  }
}
