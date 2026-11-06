// AI-assisted: Used Claude to draft these tests
//
// Drives the real routes, key store, envelope encryption, redaction and refund worker.
// Only the network edges (chain, Arkiv, 0G inference, 0G Storage) are replaced.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { ethers } from "ethers";

const m = vi.hoisted(() => ({
  nextJobId: 1,
  arkiv: new Map<string, { envelopeJson: string; expiresAtUnix: number }>(),
  chain: { status: "Completed", deadline: 0 } as { status: string; deadline: number },
  inference: vi.fn(),
  createJobOnChain: vi.fn(),
  completeJobOnChain: vi.fn(),
  refundJobOnChain: vi.fn(),
  storageOn: false,
  uploadCiphertext: vi.fn(),
}));

vi.mock("@/lib/contract", () => ({
  createJobOnChain: m.createJobOnChain,
  completeJobOnChain: m.completeJobOnChain,
  refundJobOnChain: m.refundJobOnChain,
  getJobHistory: vi.fn(async () => [
    { jobId: 1, status: "Completed", createdAt: 1, deadline: 9, completedAt: 2, expirySeconds: 120, payment: "0.5",
      fileHash: "0xf", resultHash: "0xr", attestationHash: "0xa", user: "0x00000000000000000000000000000000000000AA" },
  ]),
  getJobOnChain: vi.fn(async () => ({
    user: "0x00000000000000000000000000000000000000AA",
    status: m.chain.status,
    createdAt: 1,
    deadline: m.chain.deadline,
    completedAt: 2,
    expirySeconds: 120,
    payment: "0.5",
    fileHash: ethers.keccak256(ethers.toUtf8Bytes("file")),
    resultHash: ethers.keccak256(ethers.toUtf8Bytes("result")),
    attestationHash: ethers.keccak256(ethers.toUtf8Bytes("att")),
  })),
}));
vi.mock("@/lib/arkiv", () => ({
  storeInArkiv: vi.fn(async (jobId: string, envelopeJson: string, ttl: number) => {
    const expiresAtUnix = Math.floor(Date.now() / 1000) + ttl;
    m.arkiv.set(jobId, { envelopeJson, expiresAtUnix });
    return { entityKey: `0xentity${jobId}`, expiresAtUnix, txHash: "0xarkivtx" };
  }),
  fetchFromArkiv: vi.fn(async (jobId: string) => {
    const e = m.arkiv.get(jobId);
    return e
      ? { exists: true, envelopeJson: e.envelopeJson, expiresAtUnix: e.expiresAtUnix, entityKey: `0xentity${jobId}` }
      : { exists: false, envelopeJson: null, expiresAtUnix: 0, entityKey: null };
  }),
}));
vi.mock("@/lib/og-inference", () => ({
  runInference: m.inference,
  getTeeAttestation: vi.fn(async () => "tee-attestation"),
}));
vi.mock("@/lib/storage", () => ({
  storageConfigured: () => m.storageOn,
  uploadCiphertext: m.uploadCiphertext,
}));

import { POST } from "@/app/api/jobs/route";
import { GET as getJob } from "@/app/api/jobs/[id]/route";
import { GET as getReceipt } from "@/app/api/jobs/[id]/receipt/route";
import { GET as getHistory } from "@/app/api/history/route";
import { setKeyExpiry, getActiveKey } from "@/lib/keystore";
import { readStore } from "@/lib/store";
import { refundFailedJobs } from "@/lib/refunds";

const DOC = "PATIENT-SECRET-XYZ John Doe, DOB 1980-01-01, HbA1c 9.1%";
const RESULT = "RESULT-SECRET-ABC high HbA1c, adjust medication";
const now = () => Math.floor(Date.now() / 1000);
let dataDir: string;
let logged: string[];

function post(body: unknown) {
  return POST(new NextRequest("http://localhost/api/jobs", { method: "POST", body: JSON.stringify(body) }));
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const get = (id: string, token?: string) => {
  const headers: Record<string, string> = {};
  if (token) headers["x-access-token"] = token;
  return getJob(new NextRequest(`http://localhost/api/jobs/${id}`, { headers }), ctx(id));
};
const receipt = (id: string) => getReceipt(new NextRequest(`http://localhost/api/jobs/${id}/receipt`), ctx(id));
const req = { taskType: "medical", ttl: 120, fileName: "report.txt", fileContent: DOC };
const storeText = () => readFileSync(path.join(dataDir, "store.json"), "utf8");

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "enigma-flow-"));
  process.env.ENIGMA_DATA_DIR = dataDir;
  process.env.ORACLE_PRIVATE_KEY = ethers.Wallet.createRandom().privateKey;
  process.env.DEPLOYER_PRIVATE_KEY = ethers.Wallet.createRandom().privateKey;
  process.env.ZG_API_KEY = "zg-test-key-0123456789";
  process.env.CONTRACT_ADDRESS = ethers.Wallet.createRandom().address;
  m.nextJobId = 1;
  m.arkiv.clear();
  m.storageOn = false;
  m.chain = { status: "Completed", deadline: 0 };
  m.createJobOnChain.mockReset().mockImplementation(async () => ({ jobId: m.nextJobId++, txHash: "0xcreatetx" }));
  m.completeJobOnChain.mockReset().mockResolvedValue("0xcompletetx");
  m.refundJobOnChain.mockReset().mockResolvedValue("0xrefundtx");
  m.uploadCiphertext.mockReset().mockResolvedValue({ rootHash: "0xroot", txHash: "0xstoragetx" });
  m.inference.mockReset().mockResolvedValue({ chatId: "chat-1", content: RESULT, provider: "p", requestId: "r" });
  logged = [];
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, level).mockImplementation((...a: unknown[]) => { logged.push(a.map(String).join(" ")); });
  }
});
afterEach(() => vi.restoreAllMocks());

describe("successful job cycle: nothing sensitive is kept (#63)", () => {
  it("never writes the document, the result or key material to disk, logs or errors", async () => {
    const res = await post(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.result).toBe(RESULT); // the caller gets the result once, in the response
    expect(body.accessToken).toBeTruthy();

    const id = body.jobId as string;
    const token = body.accessToken as string;
    const keyBase64 = (await readStore()).keys[id].keyMaterial as string;
    expect(keyBase64).toBeTruthy(); // the live key exists while the result is alive

    // Arkiv, the only external store of the result, holds ciphertext only.
    const stored = m.arkiv.get(id)!.envelopeJson;
    expect(stored).not.toContain("RESULT-SECRET-ABC");
    expect(stored).not.toContain("PATIENT-SECRET-XYZ");

    // Local store: no plaintext, ever.
    expect(storeText()).not.toContain("PATIENT-SECRET-XYZ");
    expect(storeText()).not.toContain("RESULT-SECRET-ABC");

    // Let the key expire and destroy it through a normal request.
    await setKeyExpiry(id, now() - 1);
    await get(id, token);
    const after = storeText();
    expect(after).not.toContain(keyBase64);
    expect((await readStore()).keys[id].keyMaterial).toBeNull();

    // Nothing printed, and no error body, carried secrets.
    const everything = logged.join("\n") + JSON.stringify(body);
    expect(everything).not.toContain(keyBase64);
    expect(everything).not.toContain("PATIENT-SECRET-XYZ");
    expect(logged.join("\n")).not.toContain("RESULT-SECRET-ABC");
  });
});

describe("key destruction (#52)", () => {
  it("keeps the ciphertext byte-for-byte, but every API path stops returning the result", async () => {
    const created = await (await post(req)).json();
    const id = String(created.jobId);
    const token = created.accessToken as string;
    const ciphertext = m.arkiv.get(id)!.envelopeJson;

    const live = await (await get(id, token)).json();
    expect(live.result).toBe(RESULT);
    expect(live.keyDestroyed).toBe(false);

    await setKeyExpiry(id, now() - 1);
    const dead = await (await get(id, token)).json();
    expect(dead.result).toBeNull();
    expect(dead.keyDestroyed).toBe(true);
    expect(dead.keyState).toBe("DESTROYED");
    expect(dead.arkivEntityExists).toBe(true); // the ciphertext is still there...
    expect(dead.ciphertextPreview).toBeTruthy();
    expect(m.arkiv.get(id)!.envelopeJson).toBe(ciphertext); // ...unchanged
    expect(await getActiveKey(id)).toBeNull(); // ...and undecryptable

    const r = await (await receipt(id)).json();
    expect(r.keyDestroyed).toBe(true);
    expect(r.destructionReceiptValid).toBe(true);
    expect(JSON.stringify(r)).not.toContain("RESULT-SECRET-ABC");
  });

  it("returns 404 for a job that does not exist and 400 for a bad id", async () => {
    m.chain.status = "None";
    expect((await get("999")).status).toBe(404);
    expect((await get("abc")).status).toBe(400);
  });

  it("rejects a request without a valid access token", async () => {
    const created = await (await post(req)).json();
    const id = String(created.jobId);
    expect((await get(id)).status).toBe(401);
    expect((await get(id, "wrong-token")).status).toBe(401);
    expect((await get(id, created.accessToken)).status).toBe(200);
  });
});

describe("history (#21)", () => {
  const history = () =>
    getHistory(new NextRequest("http://localhost/api/history?address=0x00000000000000000000000000000000000000AA"));

  it("joins on-chain jobs with receipts and destruction status, and never returns results", async () => {
    await post(req);
    const live = (await (await history()).json()).jobs[0];
    expect(live).toMatchObject({ jobId: 1, keyState: "ACTIVE", keyDestroyed: false, destruction: null, completeTxHash: "0xcompletetx" });

    await setKeyExpiry("1", now() - 1);
    const done = (await (await history()).json()).jobs[0];
    expect(done).toMatchObject({ keyState: "DESTROYED", keyDestroyed: true });
    expect(done.destruction).toMatchObject({ valid: true });
    expect(done.destruction.receiptHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(JSON.stringify(done)).not.toContain("RESULT-SECRET-ABC");
  });

  it("shows a failed job's error and refund state", async () => {
    m.inference.mockRejectedValue(new Error("0G inference failed: 504"));
    await post(req);
    m.chain = { status: "Pending", deadline: now() - 5 };
    await refundFailedJobs();
    const job = (await (await history()).json()).jobs[0];
    expect(job.error).toContain("504");
    expect(job.refund).toMatchObject({ state: "REFUNDED" });
  });

  it("rejects a malformed address", async () => {
    const res = await getHistory(new NextRequest("http://localhost/api/history?address=nope"));
    expect(res.status).toBe(400);
  });
});

describe("failure path (#62)", () => {
  it("fails closed when inference breaks: key destroyed, no completion, nothing leaked", async () => {
    const blob = Buffer.alloc(120, 5).toString("base64");
    m.inference.mockRejectedValue(new Error(`0G inference failed: 504 upstream echoed ${DOC} ${blob}`));
    const res = await post(req);
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body.jobId).toBe("1");
    expect(body.error).not.toContain(blob);
    expect(body.error.length).toBeLessThanOrEqual(301);
    expect(m.completeJobOnChain).not.toHaveBeenCalled();

    const s = await readStore();
    expect(s.jobs["1"].status).toBe("failed");
    expect(s.jobs["1"].error).not.toContain(blob);
    expect(s.keys["1"].state).toBe("DESTROYED");
    expect(s.keys["1"].keyMaterial).toBeNull();
    expect(storeText()).not.toContain(blob);
  });

  it("refunds a failed job only after its deadline, and only once", async () => {
    m.inference.mockRejectedValue(new Error("0G inference failed: 504 timeout"));
    await post(req);

    m.chain = { status: "Pending", deadline: now() + 1000 };
    expect(await refundFailedJobs()).toEqual([]); // too early
    expect(m.refundJobOnChain).not.toHaveBeenCalled();

    m.chain = { status: "Pending", deadline: now() - 5 };
    expect(await refundFailedJobs()).toEqual(["1"]);
    expect(m.refundJobOnChain).toHaveBeenCalledTimes(1);
    expect(m.refundJobOnChain).toHaveBeenCalledWith(1);
    const job = (await readStore()).jobs["1"];
    expect(job.refund).toMatchObject({ state: "REFUNDED", txHash: "0xrefundtx" });

    expect(await refundFailedJobs()).toEqual([]); // idempotent
    expect(m.refundJobOnChain).toHaveBeenCalledTimes(1);
  });

  it("records a refund someone else already sent, and never refunds a completed job", async () => {
    m.inference.mockRejectedValue(new Error("boom"));
    await post(req); // job 1

    m.chain = { status: "Refunded", deadline: now() - 5 };
    await refundFailedJobs();
    expect((await readStore()).jobs["1"].refund).toMatchObject({ state: "REFUNDED", txHash: null });

    await post(req); // job 2
    m.chain = { status: "Completed", deadline: now() - 5 };
    await refundFailedJobs();
    expect((await readStore()).jobs["2"].refund).toMatchObject({ state: "NOT_REQUIRED" });
    expect(m.refundJobOnChain).not.toHaveBeenCalled();
  });

  it("retries on the next pass when the refund transaction fails", async () => {
    m.inference.mockRejectedValue(new Error("boom"));
    await post(req);
    m.chain = { status: "Pending", deadline: now() - 5 };
    m.refundJobOnChain.mockRejectedValueOnce(new Error("rpc down"));
    expect(await refundFailedJobs()).toEqual([]);
    expect((await readStore()).jobs["1"].refund ?? null).toBeNull();
    expect(await refundFailedJobs()).toEqual(["1"]);
  });
});

describe("model output guards", () => {
  it("fails closed when the model returns no answer (all tokens spent reasoning)", async () => {
    m.inference.mockResolvedValue({ chatId: "c", content: "   ", provider: "p", requestId: "r", finishReason: "length" });
    const res = await post(req);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("empty result");
    expect(m.completeJobOnChain).not.toHaveBeenCalled(); // the provider is not paid for nothing
    expect(m.arkiv.size).toBe(0); // nothing stored
    const s = await readStore();
    expect(s.jobs["1"].status).toBe("failed");
    expect(s.keys["1"].state).toBe("DESTROYED");
  });

  it("marks an answer that hit the length limit as truncated", async () => {
    m.inference.mockResolvedValue({ chatId: "c", content: "Partial analysis", provider: "p", requestId: "r", finishReason: "length" });
    const body = await (await post(req)).json();
    expect(body.result).toContain("Partial analysis");
    expect(body.result).toContain("[Output truncated");
  });

  it("leaves a complete answer untouched", async () => {
    m.inference.mockResolvedValue({ chatId: "c", content: "Full analysis", provider: "p", requestId: "r", finishReason: "stop" });
    expect((await (await post(req)).json()).result).toBe("Full analysis");
  });
});

describe("0G Storage (#49)", () => {
  it("uploads only the encrypted input and records where it went", async () => {
    m.storageOn = true;
    const res = await post(req);
    expect(res.status).toBe(200);
    expect(m.uploadCiphertext).toHaveBeenCalledTimes(1);
    const uploaded = m.uploadCiphertext.mock.calls[0][0] as string;
    expect(uploaded).not.toContain("PATIENT-SECRET-XYZ");
    const env = JSON.parse(uploaded);
    expect(env).toMatchObject({ version: 1, algorithm: "AES-256-GCM", aad: { jobId: "1", objectType: "input" } });
    expect((await readStore()).jobs["1"].inputStorage).toEqual({ rootHash: "0xroot", txHash: "0xstoragetx" });
  });

  it("fails closed, before any inference, when the upload fails", async () => {
    m.storageOn = true;
    m.uploadCiphertext.mockRejectedValue(new Error("0G Storage upload failed: no gas"));
    const res = await post(req);
    expect(res.status).toBe(502);
    expect(m.inference).not.toHaveBeenCalled(); // the document never reaches the model
    expect(m.completeJobOnChain).not.toHaveBeenCalled();
    expect((await readStore()).jobs["1"].status).toBe("failed");
    expect((await readStore()).keys["1"].state).toBe("DESTROYED");
  });

  it("skips storage when it is not configured", async () => {
    await post(req);
    expect(m.uploadCiphertext).not.toHaveBeenCalled();
    expect((await readStore()).jobs["1"].inputStorage ?? null).toBeNull();
  });
});

describe("request guards", () => {
  it("rejects bad input before touching the chain", async () => {
    for (const bad of [
      { ...req, taskType: "tax" },
      { ...req, ttl: 5 },
      { ...req, ttl: 90.5 },
      { ...req, fileContent: "" },
      { ...req, fileContent: 123 },
    ]) {
      expect((await post(bad)).status).toBe(400);
    }
    expect(m.createJobOnChain).not.toHaveBeenCalled();
  });

  it("rejects an oversized file with 413, before touching the chain", async () => {
    const res = await post({ ...req, fileContent: "a".repeat(8_000_001) });
    expect(res.status).toBe(413);
    expect(m.createJobOnChain).not.toHaveBeenCalled();
  });

  it("refuses to lock a payment when keys are misconfigured", async () => {
    process.env.ORACLE_PRIVATE_KEY = "not-a-key";
    const res = await post(req);
    expect(res.status).toBe(503);
    expect(m.createJobOnChain).not.toHaveBeenCalled();
  });
});
