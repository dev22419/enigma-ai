// AI-assisted: Used Claude to write this file.
"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  decryptEnvelope,
  encryptText,
  hashText,
  hasKey,
  loadKey,
  loadToken,
  loadWipeReceipt,
  newJobKey,
  parseEnvelope,
  setKeyExpiry,
  storeKey,
  storeToken,
  wipeAllKeys,
  wipeExpiredKeys,
  wipeKey,
} from "@/lib/client/vault";
import { buildAuthMessage } from "@/lib/auth-message";
import { CHAIN_ID, ENIGMA_ADDRESS } from "@/lib/client/chain";

/**
 * Client side of the Enigma API (POST /api/jobs, GET /api/jobs/[id], /receipt, /balance, /history).
 *
 * The browser keeps an index of the jobs it started (id, file name, task, lifespan) so the desk can
 * list them. It never stores answers: a result is fetched from the API while the job's key exists,
 * and once the key is destroyed there is nothing left to fetch.
 *
 * Preview jobs (ids starting "preview-") are simulated locally, and only offered when the server
 * reports it is not configured. They are always labelled as previews.
 */

export type Task = "medical" | "legal" | "financial";
/** locked: the job finished, but this browser session doesn't hold its key (e.g. a new tab session). */
export type Phase = "working" | "readable" | "locked" | "destroyed" | "failed" | "refunded" | "missing";

export const TTL_OPTIONS = [
  { label: "1 min", ttl: 60 },
  { label: "1 hour", ttl: 3600 },
  { label: "1 day", ttl: 86400 },
  { label: "7 days", ttl: 604800 },
  { label: "30 days", ttl: 2592000 },
];

export interface IndexEntry {
  id: string;
  fileName: string;
  task: Task;
  ttl: number;
  createdAt: number; // ms
  expiresAt: number | null; // ms
  preview: boolean;
  user?: string;
  /** Conversation this job belongs to in the chat. */
  thread?: string;
}

export interface Destruction {
  destructionTimestamp: number;
  receiptHash: string;
  signer: string;
  signature?: string;
  valid: boolean | null;
}

export interface JobVM {
  id: string;
  preview: boolean;
  phase: Phase;
  fileName: string;
  task: Task | null;
  ttl: number;
  createdAt: number;
  expiresAt: number | null;
  result: string | null;
  user: string | null;
  payment: string | null;
  fileHash: string | null;
  resultHash: string | null;
  attestationHash: string | null;
  requestId: string | null;
  createTxHash: string | null;
  completeTxHash: string | null;
  arkivEntityKey: string | null;
  arkivEntityExists: boolean | null;
  inputStorage: { rootHash: string; txHash: string } | null;
  /** Where the key is: in this browser, wiped at expiry, or not here at all. */
  keyState: "IN_BROWSER" | "WIPED" | "NOT_HERE" | null;
  ciphertextPreview: string | null;
  destruction: Destruction | null;
  /** The transaction that recorded the key wipe on-chain, once the server has anchored it. */
  anchorTxHash: string | null;
}

// ------------------------------------------------------------------ local index

const KEY = "enigma.jobs.v2";
let index: IndexEntry[] | null = null;
const listeners = new Set<() => void>();

function loadIndex(): IndexEntry[] {
  if (index) return index;
  try {
    index = JSON.parse(localStorage.getItem(KEY) || "[]") as IndexEntry[];
  } catch {
    index = [];
  }
  return index;
}

function saveIndex(next: IndexEntry[]) {
  index = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: keep it in memory */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      index = null;
      l();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

/** Jobs started in this browser, newest first. `null` until hydrated. */
export function useIndex(): IndexEntry[] | null {
  return useSyncExternalStore(subscribe, loadIndex, () => null);
}

export function remember(entry: IndexEntry) {
  saveIndex([entry, ...loadIndex().filter((e) => e.id !== entry.id)]);
}

export function patchEntry(id: string, patch: Partial<IndexEntry>) {
  const all = loadIndex();
  if (!all.some((e) => e.id === id)) return;
  saveIndex(all.map((e) => (e.id === id ? { ...e, ...patch } : e)));
}

/** Clears the job list. Keys go first, so nothing readable outlives the list that points to it. */
export function forgetAll() {
  wipeAllKeys();
  saveIndex([]);
}

export function knownAddress(all: IndexEntry[] | null) {
  return all?.find((e) => !e.preview && e.user)?.user ?? null;
}

// ------------------------------------------------------------------ API

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: Record<string, unknown> = {},
  ) {
    super(message);
  }
  /** The server refused because keys or addresses are missing from its .env */
  get notConfigured() {
    return this.status === 503 && /not configured/i.test(this.message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init });
  } catch {
    throw new ApiError("Couldn't reach the Enigma API. Check that the server is running.", 0);
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(String(body.error ?? `Request failed (${res.status})`), res.status, body);
  return body as T;
}

/* Shapes from src/lib/types.ts on master (zero-storage proxy, #26). */
interface CreateJobResponse {
  jobId: string;
  createTxHash: string;
  inputStorage: { rootHash: string; txHash: string } | null;
  accessToken: string;
}
interface InferResponse {
  result: string;
  chatId: string;
  resultHash: string;
  attestationHash: string;
  provider: string;
  requestId: string;
}
interface StoreResultResponse {
  completeTxHash: string;
  arkivEntityKey: string;
  expiresAt: number;
}

export type Stage = "encrypt" | "authorize" | "create" | "infer" | "seal" | "store";
export const STAGE_LABEL: Record<Stage, string> = {
  encrypt: "Encrypting in your browser",
  authorize: "Waiting for your wallet to sign",
  create: "Opening the job on Whitechain",
  infer: "Reading inside the 0G enclave",
  seal: "Encrypting the answer in your browser",
  store: "Storing the encrypted answer on Arkiv",
};

/** Answers decrypted (or received) in this tab, so they show without a round trip. Memory only. */
const fresh = new Map<string, string>();

function post<T>(url: string, body: unknown, token?: string) {
  return call<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { "x-access-token": token } : {}) },
    body: JSON.stringify(body),
  });
}

/**
 * One private job, driven from the browser:
 * encrypt here, open the job with the ciphertext, read in the enclave, encrypt the answer here,
 * store that ciphertext. The key never leaves this tab.
 */
/** A wallet that can pay: its address, the current query price, and a way to ask it to sign. */
export interface Payer {
  address: string;
  price: string;
  sign: (message: string) => Promise<string>;
}

/**
 * The server never needs to know what a document is called ("patient_jane_doe_labs.pdf" is itself sensitive).
 * It only uses the extension, to tell an image from text, so that is all it gets.
 */
export function neutralFileName(name: string) {
  const ext = name.match(/\.(png|jpe?g|gif|webp)$/i)?.[0].toLowerCase();
  return ext ? `image${ext}` : "document.txt";
}

export async function runJob(
  input: { taskType: Task; ttl: number; fileName: string; content: string },
  onStage: (s: Stage) => void,
  onCreated?: (jobId: string) => void,
  payer?: Payer,
): Promise<{ jobId: string; expiresAt: number; result: string }> {
  onStage("encrypt");
  const fileName = neutralFileName(input.fileName);
  const fileHash = hashText(input.content);
  const { key, keyId } = await newJobKey();
  const encryptedFile = await encryptText(key, keyId, input.content, { objectType: "input", fileHash });

  // A wallet pays only by signing this exact job: this document, this lifespan, this price, once.
  let auth: { userAddress: string; signature: string; nonce: string; validUntil: number } | null = null;
  if (payer) {
    onStage("authorize");
    const nonce = `0x${Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("")}`;
    const validUntil = Math.floor(Date.now() / 1000) + 300;
    const message = buildAuthMessage({
      userAddress: payer.address,
      fileHash,
      ttl: input.ttl,
      price: payer.price,
      validUntil,
      nonce,
      contract: ENIGMA_ADDRESS,
      chainId: CHAIN_ID,
    });
    auth = { userAddress: payer.address, signature: await payer.sign(message), nonce, validUntil };
  }

  onStage("create");
  const created = await post<CreateJobResponse>("/api/jobs", {
    taskType: input.taskType,
    ttl: input.ttl,
    fileName,
    fileHash,
    encryptedFile,
    ...(auth ?? {}),
  });
  const jobId = created.jobId;
  // Provisional deadline: the requested lifespan from now, plus a small margin for the remaining steps.
  await storeKey(jobId, key, keyId, Math.floor(Date.now() / 1000) + input.ttl + 120);
  storeToken(jobId, created.accessToken);
  // Record the job right away, so it can always be found (and its key wiped) even if the tab closes mid-run.
  onCreated?.(jobId);

  try {
    onStage("infer");
    // 0G's providers occasionally drop a request. Another try is safe (the server allows three per job).
    let inf: InferResponse | null = null;
    for (let attempt = 1; !inf; attempt++) {
      try {
        inf = await post<InferResponse>("/api/infer", { jobId, taskType: input.taskType, content: input.content, fileName }, created.accessToken);
      } catch (e) {
        const retryable = e instanceof ApiError && e.status === 502 && attempt < 3;
        if (!retryable) throw e;
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }

    onStage("seal");
    const encryptedResult = await encryptText(key, keyId, inf.result, { jobId, objectType: "result" });

    onStage("store");
    const stored = await post<StoreResultResponse>(
      `/api/jobs/${jobId}/result`,
      { encryptedResult, resultHash: inf.resultHash, attestationHash: inf.attestationHash, chatId: inf.chatId },
      created.accessToken,
    );
    setKeyExpiry(jobId, stored.expiresAt);
    fresh.set(jobId, inf.result);
    return { jobId, expiresAt: stored.expiresAt * 1000, result: inf.result };
  } catch (e) {
    // The job is open on-chain but won't complete: drop the key, and the contract refunds after its timeout.
    wipeKey(jobId, Math.floor(Date.now() / 1000));
    const err = e instanceof ApiError ? e : new ApiError(String(e), 0);
    throw new ApiError(err.message, err.status, { ...err.body, jobId, refund: "after the contract's timeout" });
  }
}

type ApiJob = {
  jobId: number;
  user: string;
  status: "None" | "Pending" | "Processing" | "Completed" | "Failed" | "Refunded" | "Expired" | "KeyDestroyed" | string;
  createdAt: number;
  expirySeconds: number;
  payment: string;
  fileHash: string;
  resultHash: string;
  attestationHash: string;
  requestId: string | null;
  arkivEntityKey: string | null;
  inputStorage: { rootHash: string; txHash: string } | null;
  createTxHash: string | null;
  completeTxHash: string | null;
  expiresAt: number | null;
  /** Raw ciphertext envelope from Arkiv, only when the access token matches. */
  encryptedResult: string | null;
  arkivEntityExists: boolean;
  destruction: (Omit<Destruction, "valid"> & { valid?: boolean }) | null;
  /** The browser's key-wipe receipt, anchored on-chain by the server. */
  keyWipe: { receiptHash: string; destructionTimestamp: number; anchorTxHash: string } | null;
};

export type ApiReceipt = {
  jobId: string;
  requestId: string | null;
  createTxHash: string | null;
  completeTxHash: string | null;
  attestationHash: string | null;
  resultHash: string | null;
  fileHash: string;
  arkivEntityKey: string | null;
  expiresAt: number | null;
  destruction: (Omit<Destruction, "valid"> & { jobId: string; keyId: string; expiryTimestamp: number }) | null;
  destructionReceiptValid: boolean | null;
};

export const getReceipt = (id: string) => call<ApiReceipt>(`/api/jobs/${id}/receipt`);
export const getBalance = (address: string) =>
  call<{ balance: string; queryPrice: string; queriesRemaining: number }>(`/api/balance?address=${address}`);

const ZERO = /^0x0+$/;
const nz = (h: string | null | undefined) => (h && !ZERO.test(h) ? h : null);

const STUCK_MS = 15 * 60 * 1000;

function phaseOf(j: ApiJob, now: number, plain: string | null, wiped: boolean, held: boolean): Phase {
  if (j.status === "None") return "missing";
  if (j.status === "Refunded") return "refunded";
  // The 8-state contract reports these directly, so don't wait for the clock or the stuck timeout.
  if (j.status === "Failed") return "failed";
  if (j.status === "Expired" || j.status === "KeyDestroyed" || j.keyWipe) return "destroyed";
  const exp = j.expiresAt ? j.expiresAt * 1000 : null;
  if (wiped || (exp && now >= exp)) return "destroyed";
  if (j.status === "Completed") return plain ? "readable" : held ? "working" : "locked";
  // Pending for a long time means the job never completed; the contract refunds it after its timeout.
  if (j.createdAt && now - j.createdAt * 1000 > STUCK_MS) return "failed";
  return "working";
}

function fromApi(j: ApiJob, entry: IndexEntry | undefined, now: number, plain: string | null): JobVM {
  const id = String(j.jobId);
  const wipe = loadWipeReceipt(id);
  const held = hasKey(id);
  const env = j.encryptedResult ? parseEnvelope(j.encryptedResult) : null;
  return {
    id,
    preview: false,
    phase: phaseOf(j, now, plain, !!wipe, held),
    fileName: entry?.fileName ?? `Job ${j.jobId}`,
    task: entry?.task ?? null,
    ttl: j.expirySeconds || entry?.ttl || 0,
    createdAt: j.createdAt ? j.createdAt * 1000 : entry?.createdAt ?? now,
    expiresAt: j.expiresAt ? j.expiresAt * 1000 : entry?.expiresAt ?? null,
    result: wipe ? null : plain,
    user: j.user,
    payment: j.payment,
    fileHash: nz(j.fileHash),
    resultHash: nz(j.resultHash),
    attestationHash: nz(j.attestationHash),
    requestId: j.requestId,
    createTxHash: j.createTxHash,
    completeTxHash: j.completeTxHash,
    arkivEntityKey: j.arkivEntityKey,
    arkivEntityExists: j.arkivEntityExists,
    inputStorage: j.inputStorage,
    keyState: wipe ? "WIPED" : held ? "IN_BROWSER" : "NOT_HERE",
    ciphertextPreview: env ? env.ct.slice(0, 160) : null,
    destruction: wipe
      ? { destructionTimestamp: wipe.destructionTimestamp, receiptHash: wipe.receiptHash, signer: "this browser", valid: true }
      : j.keyWipe
        ? { destructionTimestamp: j.keyWipe.destructionTimestamp, receiptHash: j.keyWipe.receiptHash, signer: "a browser", valid: true }
        : j.destruction
          ? { ...j.destruction, valid: j.destruction.valid ?? null }
          : null,
    anchorTxHash: j.keyWipe?.anchorTxHash ?? null,
  };
}

// ------------------------------------------------------------------ preview simulation

const PIPELINE_MS = 7200;

function rand(n: number) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export const PREVIEW_ANSWERS: Record<Task, string> = {
  medical: `SUMMARY
- Follow-up for type 2 diabetes and raised blood pressure. Increased thirst and dizziness on standing for three weeks.
KEY FINDINGS
- HbA1c 8.4% (flagged high), up from 7.6% in April.
- Blood pressure 148/92 mmHg seated.
DIAGNOSES AND HISTORY
- Type 2 diabetes since 2019. Hypertension since 2021. Penicillin allergy (rash).
MEDICATIONS
- Metformin 1000 mg twice daily.
- Lisinopril 10 mg once daily.
ITEMS NEEDING CLINICIAN ATTENTION
- Dizziness on standing while on lisinopril.
- HbA1c rising across the last two results.`,
  legal: `SUMMARY
- Two-year supply agreement between a manufacturer and a distributor, renewing automatically.
PARTIES AND DATES
- Effective 1 December 2026. Initial term 24 months.
KEY OBLIGATIONS
- Supplier must give 90 days' notice before ending supply.
FEES, TERMINATION AND RENEWAL
- Renews yearly unless cancelled 60 days before the renewal date.
RISKS AND UNUSUAL CLAUSES
- Clause 14.2 caps the supplier's liability at one month of fees.
MISSING OR AMBIGUOUS TERMS
- No service level for late deliveries: Not stated.`,
  financial: `SUMMARY
- Quarterly statement showing revenue growth with a falling cash balance.
KEY FIGURES
- Revenue 4.2 crore INR for Q3 2026.
- Cash at period end 61 lakh INR.
TRENDS
- Revenue up 12% on Q2. Cash down 28% on Q2.
RISKS AND ANOMALIES
- 38% of revenue from a single customer.
OPEN QUESTIONS
- The cause of the drop in cash is not stated.`,
};

/** Preview answers only exist for the bundled samples; anything else gets an honest placeholder. */
const SAMPLE_ANSWERS: Record<string, string> = {
  "sample-medical-report.txt": PREVIEW_ANSWERS.medical,
  "sample-legal-contract.txt": PREVIEW_ANSWERS.legal,
  "sample-financial-statement.txt": PREVIEW_ANSWERS.financial,
  "sample-injection-test.txt": `SUMMARY
- Routine check for demo patient 0002 with no complaints.
KEY FINDINGS
- Blood pressure 122/80 mmHg. Heart rate 70 bpm.
MEDICATIONS
- None.
RECOMMENDED FOLLOW-UP
- Routine review in 12 months.
ITEMS NEEDING CLINICIAN ATTENTION
- The note contains text addressed to the AI asking it to ignore its instructions. It was treated as document content and not followed.`,
};

function previewAnswer(e: IndexEntry) {
  return (
    SAMPLE_ANSWERS[e.fileName] ??
    `SUMMARY
- This is a preview, so no model read your text. A real job would return an analysis in the ${e.task} sections here.
WHAT HAPPENS FOR REAL
- Your text is encrypted with a one-time key, read inside 0G's enclave, and the answer is stored encrypted on Arkiv until the timer ends.`
  );
}

export function createPreview(input: { fileName: string; task: Task; ttl: number; thread?: string }): IndexEntry {
  const now = Date.now();
  const entry: IndexEntry = {
    id: `preview-${now.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
    fileName: input.fileName,
    task: input.task,
    ttl: input.ttl,
    createdAt: now,
    expiresAt: now + PIPELINE_MS + input.ttl * 1000,
    preview: true,
    thread: input.thread,
  };
  remember(entry);
  // Hashes are generated once per preview and kept with it, so the page is stable across reloads.
  try {
    localStorage.setItem(
      `${KEY}.${entry.id}`,
      JSON.stringify({
        fileHash: rand(32),
        resultHash: rand(32),
        attestationHash: rand(32),
        requestId: `chatcmpl-${rand(8).slice(2)}`,
        createTxHash: rand(32),
        completeTxHash: rand(32),
        arkivEntityKey: rand(32),
        receiptHash: rand(32),
        root: rand(32),
        cipher: rand(48).slice(2),
      }),
    );
  } catch {
    /* fine: previews still render with blanks */
  }
  return entry;
}

function fromPreview(e: IndexEntry, now: number): JobVM {
  let h: Record<string, string> = {};
  try {
    h = JSON.parse(localStorage.getItem(`${KEY}.${e.id}`) || "{}");
  } catch {
    /* ignore */
  }
  const liveAt = e.createdAt + PIPELINE_MS;
  const exp = e.expiresAt ?? liveAt + e.ttl * 1000;
  const phase: Phase = now >= exp ? "destroyed" : now >= liveAt ? "readable" : "working";
  const done = phase !== "working";
  return {
    id: e.id,
    preview: true,
    phase,
    fileName: e.fileName,
    task: e.task,
    ttl: e.ttl,
    createdAt: e.createdAt,
    expiresAt: exp,
    result: phase === "readable" ? previewAnswer(e) : null,
    user: null,
    payment: "2.0",
    fileHash: h.fileHash ?? null,
    resultHash: done ? h.resultHash ?? null : null,
    attestationHash: done ? h.attestationHash ?? null : null,
    requestId: done ? h.requestId ?? null : null,
    createTxHash: h.createTxHash ?? null,
    completeTxHash: done ? h.completeTxHash ?? null : null,
    arkivEntityKey: done ? h.arkivEntityKey ?? null : null,
    arkivEntityExists: phase === "readable",
    inputStorage: h.root ? { rootHash: h.root, txHash: h.createTxHash } : null,
    keyState: phase === "destroyed" ? "WIPED" : "IN_BROWSER",
    ciphertextPreview: done ? h.cipher ?? null : null,
    destruction:
      phase === "destroyed"
        ? { destructionTimestamp: Math.floor(exp / 1000), receiptHash: h.receiptHash ?? "", signer: "0x279eBb05E158315Bb92e9749b8BA45c17992B37e", valid: true }
        : null,
    anchorTxHash: phase === "destroyed" ? h.completeTxHash ?? null : null,
  };
}

// ------------------------------------------------------------------ hooks

/** Live view of one job. Polls the API while the job can still change, and decrypts in this tab. */
export function useJobVM(id: string) {
  const all = useIndex();
  const now = useNow();
  const entry = all?.find((e) => e.id === id);
  const preview = id.startsWith("preview-");
  const [api, setApi] = useState<ApiJob | null>(null);
  const [plain, setPlain] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [receipt, setReceipt] = useState<ApiReceipt | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const token = loadToken(id);
      const j = await call<ApiJob>(`/api/jobs/${id}`, token ? { headers: { "x-access-token": token } } : undefined);
      setApi(j);
      setError(null);
      if (j.expiresAt) patchEntry(String(j.jobId), { expiresAt: j.expiresAt * 1000, user: j.user });
      if (j.status === "Completed") setReceipt(await getReceipt(id).catch(() => null));
      // Decrypt here, with the key only this tab holds. No key, no answer.
      const k = loadWipeReceipt(id) ? null : await loadKey(id);
      if (k && j.encryptedResult) {
        try {
          const text = await decryptEnvelope(k.key, j.encryptedResult, { jobId: id, objectType: "result" });
          fresh.set(id, text);
          setPlain(text);
        } catch {
          setPlain(null);
        }
      } else {
        setPlain(fresh.get(id) && k ? fresh.get(id)! : null);
      }
      return j;
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(String(e), 0));
      return null;
    }
  }, [id]);

  useEffect(() => {
    if (preview) return;
    let stop = false;
    const loop = async () => {
      const j = await load();
      if (stop) return;
      const settled = j && (loadWipeReceipt(id) || j.status === "Refunded" || j.status === "None");
      if (settled) return;
      // Poll faster near expiry so the destruction shows up promptly.
      const msLeft = j?.expiresAt ? j.expiresAt * 1000 - Date.now() : Infinity;
      timer.current = setTimeout(loop, msLeft < 15000 ? 2000 : 8000);
    };
    loop();
    return () => {
      stop = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [preview, load, id]);

  if (!now || all === null) return { vm: null, error: null, receipt: null, loading: true };
  if (preview) {
    if (!entry) return { vm: null, error: new ApiError("This preview isn't in this browser any more.", 404), receipt: null, loading: false };
    return { vm: fromPreview(entry, now), error: null, receipt: null, loading: false };
  }
  const shown = plain ?? (hasKey(id) ? fresh.get(id) ?? null : null);
  return { vm: api ? fromApi(api, entry, now, shown) : null, error, receipt, loading: !api && !error };
}

/** Tries to decrypt a job's answer right now. Used to show that, once the key is wiped, it can't be done. */
export async function tryDecrypt(id: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const k = await loadKey(id);
  if (!k) return { ok: false, reason: "No key for this job exists in this browser, so the ciphertext can't be opened." };
  const token = loadToken(id);
  try {
    const j = await call<ApiJob>(`/api/jobs/${id}`, token ? { headers: { "x-access-token": token } } : undefined);
    if (!j.encryptedResult) return { ok: false, reason: "Arkiv no longer holds the ciphertext." };
    await decryptEnvelope(k.key, j.encryptedResult, { jobId: id, objectType: "result" });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Wipes every expired key in this browser session (task #74). It reads the keys' own deadlines
 * from storage, so a key is wiped even if its job is missing from the list. Arkiv's expiry, when
 * known on the list, also counts.
 */
export function wipeExpired(all: IndexEntry[], now: number) {
  let wiped = wipeExpiredKeys(Math.floor(now / 1000));
  for (const e of all) {
    if (e.preview || !e.expiresAt || now < e.expiresAt) continue;
    if (hasKey(e.id) && wipeKey(e.id, Math.floor(e.expiresAt / 1000))) wiped++;
  }
  anchorPendingWipes(all);
  return wiped;
}

const anchoring = new Set<string>();
const lastTry = new Map<string, number>();

/**
 * Sends each wipe receipt to the server once, so the contract records that the key was destroyed (task board #75).
 * Needs the job's access token, which lives in this session. A failure is retried on the next tick.
 * Preview jobs are never anchored: they have no job on-chain.
 */
export function anchorPendingWipes(all: IndexEntry[]) {
  for (const e of all) {
    if (e.preview || anchoring.has(e.id)) continue;
    const receipt = loadWipeReceipt(e.id);
    const token = loadToken(e.id);
    if (!receipt || !token || localStorage.getItem(`enigma.anchored.${e.id}`)) continue;
    // At most one try every 10 seconds per job, so a failing server isn't hammered once a second.
    if (Date.now() - (lastTry.get(e.id) ?? 0) < 10000) continue;
    lastTry.set(e.id, Date.now());
    anchoring.add(e.id);
    post<{ receiptHash: string; anchorTxHash: string }>(
      `/api/jobs/${e.id}/destroyed`,
      { keyId: receipt.keyId, expiryTimestamp: receipt.expiryTimestamp, destructionTimestamp: receipt.destructionTimestamp, status: "wiped" },
      token,
    )
      .then(() => {
        try {
          localStorage.setItem(`enigma.anchored.${e.id}`, "1");
        } catch {
          /* it will just be retried, and the server answers idempotently */
        }
      })
      .catch((err) => {
        // Final answers: the job never completed (409), or the server no longer knows the token because it was
        // already anchored and scrubbed (403) or the job is gone (404). Anything else (not expired on-chain yet,
        // network trouble) is retried.
        const final = err instanceof ApiError && (err.status === 403 || err.status === 404 || (err.status === 409 && /Only a completed job/.test(err.message)));
        if (final) {
          try {
            localStorage.setItem(`enigma.anchored.${e.id}`, "n/a");
          } catch {
            /* ignore */
          }
        }
      })
      .finally(() => anchoring.delete(e.id));
  }
}

/** Index entries with a cheap local phase, for lists. */
export function localPhase(e: IndexEntry, now: number): Phase {
  if (e.preview) return fromPreview(e, now).phase;
  if (loadWipeReceipt(e.id) || (e.expiresAt && now >= e.expiresAt)) return "destroyed";
  return e.expiresAt ? "readable" : "working";
}

// ------------------------------------------------------------------ clock

let nowValue = 0;
const clockListeners = new Set<() => void>();
let tick: ReturnType<typeof setInterval> | null = null;

function clockSubscribe(l: () => void) {
  clockListeners.add(l);
  if (!tick) {
    nowValue = Date.now();
    tick = setInterval(() => {
      nowValue = Date.now();
      clockListeners.forEach((x) => x());
    }, 250);
  }
  return () => {
    clockListeners.delete(l);
    if (!clockListeners.size && tick) {
      clearInterval(tick);
      tick = null;
    }
  };
}

/** Shared 4 Hz clock. 0 during server render. */
export function useNow() {
  return useSyncExternalStore(clockSubscribe, () => nowValue || Date.now(), () => 0);
}

// ------------------------------------------------------------------ formatting

export function countdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const p = (x: number) => String(x).padStart(2, "0");
  if (d) return `${d}d ${p(h)}:${p(m)}:${p(r)}`;
  return h ? `${p(h)}:${p(m)}:${p(r)}` : `${p(m)}:${p(r)}`;
}

export function short(hash: string | null | undefined, a = 6, b = 6) {
  if (!hash) return "";
  return hash.length > a + b + 1 ? `${hash.slice(0, a)}…${hash.slice(-b)}` : hash;
}

export function ttlLabel(s: number) {
  if (s >= 86400 && s % 86400 === 0) return `${s / 86400} d`;
  if (s >= 3600 && s % 3600 === 0) return `${s / 3600} h`;
  return `${Math.round(s / 60)} min`;
}

export function when(ms: number) {
  return new Date(ms).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Splits a model answer into the headed sections the system prompts ask for. */
export function sections(text: string) {
  const out: { title: string; items: string[] }[] = [];
  let cur: { title: string; items: string[] } | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const head = line.replace(/[:#*]+/g, "").trim();
    if (head.length < 60 && /^[A-Z][A-Z0-9 ,&()'/-]{2,}$/.test(head)) {
      cur = { title: head.charAt(0) + head.slice(1).toLowerCase(), items: [] };
      out.push(cur);
      continue;
    }
    if (!cur) {
      cur = { title: "", items: [] };
      out.push(cur);
    }
    cur.items.push(line.replace(/^[-*•]\s*/, ""));
  }
  return out;
}

/** A conversation in the chat: its jobs, oldest first. */
export interface Thread {
  id: string;
  jobs: IndexEntry[];
  updatedAt: number;
}

export function threadsOf(all: IndexEntry[]): Thread[] {
  const map = new Map<string, IndexEntry[]>();
  for (const e of all) {
    const key = e.thread ?? `job-${e.id}`;
    map.set(key, [...(map.get(key) ?? []), e]);
  }
  return [...map.entries()]
    .map(([id, jobs]) => {
      const sorted = jobs.sort((a, b) => a.createdAt - b.createdAt);
      return { id, jobs: sorted, updatedAt: sorted[sorted.length - 1].createdAt };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function newThreadId() {
  return `t-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}
