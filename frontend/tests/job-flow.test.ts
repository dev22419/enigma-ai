// AI-assisted: Used Claude to draft these tests
//
// Drives the real routes and refund worker against the three-endpoint API
// (POST /jobs, POST /infer, POST /jobs/[id]/result).
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
  startProcessingOnChain: vi.fn(async () => "0xprocesstx"),
  failJobOnChain: vi.fn(async () => "0xfailtx"),
  markExpiredOnChain: vi.fn(async () => "0xexpiretx"),
  markKeyDestroyedOnChain: vi.fn(async () => "0xdestroykeytx"),
  getJobHistory: vi.fn(async () => [
    { jobId: 1, status: "Completed", createdAt: 1, deadline: 9, completedAt: 2, expirySeconds: 120, payment: "0.5",
      fileHash: "0xf", resultHash: "0xr", attestationHash: "0xa", user: "0x00000000000000000000000000000000000000AA" },
  ]),
  getQueryPrice: vi.fn(async () => "0.5"),
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
  mimeTypeFromFileName: vi.fn(() => "image/png"),
}));
vi.mock("@/lib/storage", () => ({
  storageConfigured: () => m.storageOn,
  uploadCiphertext: m.uploadCiphertext,
}));

import { POST } from "@/app/api/jobs/route";
import { POST as postInfer } from "@/app/api/infer/route";
import { POST as postResult } from "@/app/api/jobs/[id]/result/route";
import { GET as getJob } from "@/app/api/jobs/[id]/route";
import { GET as getReceipt } from "@/app/api/jobs/[id]/receipt/route";
import { GET as getHistory } from "@/app/api/history/route";
import { POST as postDestroyed } from "@/app/api/jobs/[id]/destroyed/route";
import { POST as postCron } from "@/app/api/cron/expire/route";
import { buildAuthMessage } from "@/lib/auth-message";
import { failJobOnChain, markKeyDestroyedOnChain } from "@/lib/contract";
import { scrubExpiredJobs } from "@/lib/scrub";
import { SETTLE_AFTER_SECONDS, settleDeliveredJobs } from "@/lib/settle";
import { withStore } from "@/lib/store";
import { readStore } from "@/lib/store";
import { refundFailedJobs } from "@/lib/refunds";

const RESULT = "RESULT-SECRET-ABC high HbA1c, adjust medication";
const RESULT_HASH = ethers.keccak256(ethers.toUtf8Bytes(RESULT));
const ATT_HASH = ethers.keccak256(ethers.toUtf8Bytes("tee-attestation"));
// The job is opened with the hash of the document that /api/infer later receives (the server checks they match).
const FILE_HASH = ethers.keccak256(ethers.toUtf8Bytes("Patient record content"));
const now = () => Math.floor(Date.now() / 1000);
let dataDir: string;
let logged: string[];

// The most recent job a test opened, so a following inference is for that job unless a test says otherwise.
let lastJob = { id: "", token: "" };
async function postJob(body: unknown) {
  const res = await POST(new NextRequest("http://localhost/api/jobs", { method: "POST", body: JSON.stringify(body) }));
  if (res.status === 200) {
    const j = await res.clone().json();
    lastJob = { id: j.jobId, token: j.accessToken };
  }
  return res;
}
function inferReq(body: Record<string, unknown>, token = lastJob.token) {
  return postInfer(
    new NextRequest("http://localhost/api/infer", {
      method: "POST",
      body: JSON.stringify({ jobId: lastJob.id, ...body }),
      headers: token ? { "x-access-token": token } : {},
    }),
  );
}
function storeResultReq(id: string, body: unknown, token: string) {
  return postResult(
    new NextRequest(`http://localhost/api/jobs/${id}/result`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "x-access-token": token },
    }),
    { params: Promise.resolve({ id }) }
  );
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const get = (id: string, token = "") =>
  getJob(
    new NextRequest(`http://localhost/api/jobs/${id}`, { headers: { "x-access-token": token } }),
    ctx(id)
  );
const receipt = (id: string) => getReceipt(new NextRequest(`http://localhost/api/jobs/${id}/receipt`), ctx(id));

const jobReq = {
  taskType: "medical",
  ttl: 120,
  fileName: "report.txt",
  fileHash: FILE_HASH,
  encryptedFile: "ENCRYPTED_CIPHERTEXT_DATA",
};
const inferBody = { taskType: "medical", content: "Patient record content", fileName: "report.txt" };
const storeText = () => readFileSync(path.join(dataDir, "store.json"), "utf8");

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "enigma-flow-"));
  process.env.ENIGMA_DATA_DIR = dataDir;
  process.env.ORACLE_PRIVATE_KEY = ethers.Wallet.createRandom().privateKey;
  process.env.DEPLOYER_PRIVATE_KEY = ethers.Wallet.createRandom().privateKey;
  process.env.ZG_API_KEY = "zg-test-key-0123456789";
  process.env.CONTRACT_ADDRESS = ethers.Wallet.createRandom().address;
  process.env.ALLOW_SERVICE_PAID_JOBS = "true";
  lastJob = { id: "", token: "" };
  m.nextJobId = 1;
  m.arkiv.clear();
  m.storageOn = false;
  m.chain = { status: "Completed", deadline: 0 };
  m.createJobOnChain.mockReset().mockImplementation(async () => ({ jobId: m.nextJobId++, txHash: "0xcreatetx" }));
  m.completeJobOnChain.mockReset().mockResolvedValue("0xcompletetx");
  m.refundJobOnChain.mockReset().mockResolvedValue("0xrefundtx");
  m.uploadCiphertext.mockReset().mockResolvedValue({ rootHash: "0xroot", txHash: "0xstoragetx" });
  m.inference.mockReset().mockResolvedValue({ chatId: "chat-1", content: RESULT, provider: "p", requestId: "r", finishReason: "stop" });
  logged = [];
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, level).mockImplementation((...a: unknown[]) => { logged.push(a.map(String).join(" ")); });
  }
});
afterEach(() => vi.restoreAllMocks());

async function createAndComplete() {
  const createRes = await postJob(jobReq);
  const createBody = await createRes.json();
  const { jobId: id, accessToken } = createBody;

  await inferReq(inferBody);
  m.chain.status = "Pending";
  const resultPayload = {
    encryptedResult: "ENCRYPTED_RESULT_CIPHERTEXT",
    resultHash: RESULT_HASH,
    attestationHash: ATT_HASH,
    chatId: "chat-1",
  };
  await storeResultReq(id, resultPayload, accessToken);
  m.chain.status = "Completed";
  return { id, accessToken };
}

describe("three-endpoint job flow", () => {
  it("creates a job, runs inference, stores result, and completes on-chain", async () => {
    const createRes = await postJob(jobReq);
    expect(createRes.status).toBe(200);
    const createBody = await createRes.json();
    expect(createBody.jobId).toBe("1");
    expect(createBody.createTxHash).toBe("0xcreatetx");
    expect(createBody.accessToken).toBeTruthy();

    const iRes = await inferReq(inferBody);
    expect(iRes.status).toBe(200);
    const iBody = await iRes.json();
    expect(iBody.result).toBe(RESULT);
    expect(iBody.chatId).toBe("chat-1");
    expect(iBody.resultHash).toBeTruthy();
    expect(iBody.attestationHash).toBeTruthy();

    m.chain.status = "Pending";
    const resultRes = await storeResultReq("1", {
      encryptedResult: "ENCRYPTED_RESULT",
      resultHash: iBody.resultHash,
      attestationHash: iBody.attestationHash,
      chatId: iBody.chatId,
    }, createBody.accessToken);
    expect(resultRes.status).toBe(200);
    const resultBody = await resultRes.json();
    expect(resultBody.completeTxHash).toBe("0xcompletetx");
    expect(resultBody.arkivEntityKey).toBeTruthy();

    const store = await readStore();
    expect(store.jobs["1"].status).toBe("completed");
    expect(store.jobs["1"].completeTxHash).toBe("0xcompletetx");
  });

  it("returns the encrypted result from GET with a valid access token", async () => {
    const { id, accessToken } = await createAndComplete();
    const res = await get(id, accessToken);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("Completed");
    expect(body.encryptedResult).toBeTruthy();
  });

  it("local store never contains plaintext secrets", async () => {
    await createAndComplete();
    const text = storeText();
    expect(text).not.toContain("RESULT-SECRET-ABC");
    expect(text).not.toContain("PATIENT-SECRET-XYZ");
  });
});

describe("key destruction (#52)", () => {
  it("returns 404 for a job that does not exist and 400 for a bad id", async () => {
    m.chain.status = "None";
    expect((await get("999")).status).toBe(404);
    expect((await get("abc")).status).toBe(400);
  });
});

describe("history (#21)", () => {
  const history = () =>
    getHistory(new NextRequest("http://localhost/api/history?address=0x00000000000000000000000000000000000000AA"));

  it("joins on-chain jobs with local store data", async () => {
    await createAndComplete();
    const res = await history();
    const body = await res.json();
    const job = body.jobs[0];
    expect(job).toMatchObject({ jobId: 1, destruction: null, completeTxHash: "0xcompletetx" });
  });

  it("shows a failed job's error and refund state", async () => {
    const createRes = await postJob(jobReq);
    const createBody = await createRes.json();
    const { jobId: id, accessToken } = createBody;

    await inferReq(inferBody);
    m.chain.status = "Pending";
    m.completeJobOnChain.mockRejectedValueOnce(new Error("chain timeout"));
    await storeResultReq(id, {
      encryptedResult: "ENC",
      resultHash: RESULT_HASH,
      attestationHash: ATT_HASH,
      chatId: "chat-1",
    }, accessToken);

    const store = await readStore();
    expect(store.jobs[id].status).toBe("failed");

    m.chain = { status: "Pending", deadline: now() - 5 };
    await refundFailedJobs();
    const job = (await (await history()).json()).jobs[0];
    expect(job.error).toBeTruthy();
    expect(job.refund).toMatchObject({ state: "REFUNDED" });
  });

  it("rejects a malformed address", async () => {
    const res = await getHistory(new NextRequest("http://localhost/api/history?address=nope"));
    expect(res.status).toBe(400);
  });
});

describe("failure path (#62)", () => {
  it("records a failed result-store in the local store", async () => {
    const createRes = await postJob(jobReq);
    const { jobId: id, accessToken } = await createRes.json();

    await inferReq(inferBody);
    m.chain.status = "Pending";
    m.completeJobOnChain.mockRejectedValueOnce(new Error("chain error: 504"));
    const res = await storeResultReq(id, {
      encryptedResult: "ENC",
      resultHash: RESULT_HASH,
      attestationHash: ATT_HASH,
      chatId: "chat-1",
    }, accessToken);
    expect(res.status).toBe(502);

    const s = await readStore();
    expect(s.jobs[id].status).toBe("failed");
    expect(s.jobs[id].error).toBeTruthy();
    expect(m.completeJobOnChain).toHaveBeenCalled();
  });

  it("refunds a failed job only after its deadline, and only once", async () => {
    const createRes = await postJob(jobReq);
    const { jobId: id, accessToken } = await createRes.json();

    await inferReq(inferBody);
    m.chain.status = "Pending";
    m.completeJobOnChain.mockRejectedValueOnce(new Error("boom"));
    await storeResultReq(id, {
      encryptedResult: "ENC",
      resultHash: RESULT_HASH,
      attestationHash: ATT_HASH,
      chatId: "chat-1",
    }, accessToken);

    m.chain = { status: "Pending", deadline: now() + 1000 };
    expect(await refundFailedJobs()).toEqual([]);
    expect(m.refundJobOnChain).not.toHaveBeenCalled();

    m.chain = { status: "Pending", deadline: now() - 5 };
    expect(await refundFailedJobs()).toEqual(["1"]);
    expect(m.refundJobOnChain).toHaveBeenCalledTimes(1);
    expect(m.refundJobOnChain).toHaveBeenCalledWith(1);
    const job = (await readStore()).jobs["1"];
    expect(job.refund).toMatchObject({ state: "REFUNDED", txHash: "0xrefundtx" });

    expect(await refundFailedJobs()).toEqual([]);
    expect(m.refundJobOnChain).toHaveBeenCalledTimes(1);
  });

  it("records a refund someone else already sent, and never refunds a completed job", async () => {
    const res1 = await postJob(jobReq);
    const { jobId: id1, accessToken: tok1 } = await res1.json();
    await inferReq(inferBody);
    m.chain.status = "Pending";
    m.completeJobOnChain.mockRejectedValueOnce(new Error("boom"));
    await storeResultReq(id1, { encryptedResult: "E", resultHash: RESULT_HASH, attestationHash: ATT_HASH, chatId: "chat-1" }, tok1);

    m.chain = { status: "Refunded", deadline: now() - 5 };
    await refundFailedJobs();
    expect((await readStore()).jobs[id1].refund).toMatchObject({ state: "REFUNDED", txHash: null });

    const res2 = await postJob(jobReq);
    const { jobId: id2, accessToken: tok2 } = await res2.json();
    await inferReq(inferBody);
    m.chain.status = "Pending";
    m.completeJobOnChain.mockRejectedValueOnce(new Error("boom"));
    await storeResultReq(id2, { encryptedResult: "E", resultHash: RESULT_HASH, attestationHash: ATT_HASH, chatId: "chat-1" }, tok2);

    m.chain = { status: "Completed", deadline: now() - 5 };
    await refundFailedJobs();
    expect((await readStore()).jobs[id2].refund).toMatchObject({ state: "NOT_REQUIRED" });
    expect(m.refundJobOnChain).not.toHaveBeenCalled();
  });

  it("retries on the next pass when the refund transaction fails", async () => {
    const res = await postJob(jobReq);
    const { jobId: id, accessToken } = await res.json();
    await inferReq(inferBody);
    m.chain.status = "Pending";
    m.completeJobOnChain.mockRejectedValueOnce(new Error("boom"));
    await storeResultReq(id, { encryptedResult: "E", resultHash: RESULT_HASH, attestationHash: ATT_HASH, chatId: "chat-1" }, accessToken);

    m.chain = { status: "Pending", deadline: now() - 5 };
    m.refundJobOnChain.mockRejectedValueOnce(new Error("rpc down"));
    expect(await refundFailedJobs()).toEqual([]);
    expect((await readStore()).jobs["1"].refund ?? null).toBeNull();
    expect(await refundFailedJobs()).toEqual(["1"]);
  });
});

describe("model output guards", () => {
  it("fails closed when the model returns no answer (all tokens spent reasoning)", async () => {
    await postJob(jobReq);
    m.inference.mockResolvedValue({ chatId: "c", content: "   ", provider: "p", requestId: "r", finishReason: "length" });
    const res = await inferReq(inferBody);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("empty result");
  });

  it("marks an answer that hit the length limit as truncated", async () => {
    await postJob(jobReq);
    m.inference.mockResolvedValue({ chatId: "c", content: "Partial analysis", provider: "p", requestId: "r", finishReason: "length" });
    const body = await (await inferReq(inferBody)).json();
    expect(body.result).toContain("Partial analysis");
    expect(body.result).toContain("[Output truncated");
  });

  it("leaves a complete answer untouched", async () => {
    await postJob(jobReq);
    m.inference.mockResolvedValue({ chatId: "c", content: "Full analysis", provider: "p", requestId: "r", finishReason: "stop" });
    expect((await (await inferReq(inferBody)).json()).result).toBe("Full analysis");
  });
});

describe("0G Storage (#49)", () => {
  it("uploads ciphertext and records where it went", async () => {
    m.storageOn = true;
    const res = await postJob(jobReq);
    expect(res.status).toBe(200);
    expect(m.uploadCiphertext).toHaveBeenCalledTimes(1);
    expect(m.uploadCiphertext).toHaveBeenCalledWith(jobReq.encryptedFile);
    expect((await readStore()).jobs["1"].inputStorage).toEqual({ rootHash: "0xroot", txHash: "0xstoragetx" });
  });

  it("fails closed when the upload fails", async () => {
    m.storageOn = true;
    m.uploadCiphertext.mockRejectedValue(new Error("0G Storage upload failed: no gas"));
    const res = await postJob(jobReq);
    expect(res.status).toBe(502);
    expect(m.completeJobOnChain).not.toHaveBeenCalled();
  });

  it("skips storage when it is not configured", async () => {
    const res = await postJob(jobReq);
    expect(res.status).toBe(200);
    expect(m.uploadCiphertext).not.toHaveBeenCalled();
    expect((await readStore()).jobs["1"].inputStorage ?? null).toBeNull();
  });
});

describe("request guards", () => {
  it("rejects bad input before touching the chain", async () => {
    for (const bad of [
      { ...jobReq, taskType: "tax" },
      { ...jobReq, ttl: 5 },
      { ...jobReq, ttl: 90.5 },
      { ...jobReq, fileName: "" },
      { ...jobReq, fileHash: "not-a-hash" },
      { ...jobReq, encryptedFile: "" },
    ]) {
      expect((await postJob(bad)).status).toBe(400);
    }
    expect(m.createJobOnChain).not.toHaveBeenCalled();
  });

  it("rejects an oversized ciphertext with 413, before touching the chain", async () => {
    const res = await postJob({ ...jobReq, encryptedFile: "a".repeat(12_000_001) });
    expect(res.status).toBe(413);
    expect(m.createJobOnChain).not.toHaveBeenCalled();
  });

  it("refuses to lock a payment when keys are misconfigured", async () => {
    process.env.ORACLE_PRIVATE_KEY = "not-a-key";
    const res = await postJob(jobReq);
    expect(res.status).toBe(503);
    expect(m.createJobOnChain).not.toHaveBeenCalled();
  });

  it("requires an access token to store a result", async () => {
    const createRes = await postJob(jobReq);
    const { jobId: id } = await createRes.json();
    m.chain.status = "Pending";
    const res = await postResult(
      new NextRequest(`http://localhost/api/jobs/${id}/result`, {
        method: "POST",
        body: JSON.stringify({ encryptedResult: "E", resultHash: RESULT_HASH, attestationHash: ATT_HASH, chatId: "chat-1" }),
      }),
      { params: Promise.resolve({ id }) }
    );
    expect(res.status).toBe(401);
  });

  it("rejects an invalid access token", async () => {
    const createRes = await postJob(jobReq);
    const { jobId: id } = await createRes.json();
    m.chain.status = "Pending";
    const res = await storeResultReq(id, {
      encryptedResult: "E",
      resultHash: RESULT_HASH,
      attestationHash: ATT_HASH,
      chatId: "c",
    }, "wrong-token");
    expect(res.status).toBe(403);
  });
});


// ---------------------------------------------------------------------------------------------
// Who pays: a wallet's balance is only charged with that wallet's signature over this exact job.
// ---------------------------------------------------------------------------------------------
describe("wallet authorization", () => {
  const wallet = ethers.Wallet.createRandom();
  async function authBody(w = wallet, over: Record<string, unknown> = {}) {
    const f = {
      userAddress: w.address,
      fileHash: FILE_HASH,
      ttl: 120,
      price: "0.5",
      validUntil: now() + 300,
      nonce: ethers.hexlify(ethers.randomBytes(16)),
      contract: process.env.CONTRACT_ADDRESS!,
      chainId: 1874,
      ...over,
    };
    const signature = await w.signMessage(buildAuthMessage(f));
    return { ...jobReq, userAddress: f.userAddress, signature, nonce: f.nonce, validUntil: f.validUntil };
  }

  it("refuses to open a job without a wallet signature unless service-paid jobs are switched on", async () => {
    delete process.env.ALLOW_SERVICE_PAID_JOBS;
    const res = await postJob(jobReq);
    expect(res.status).toBe(401);
    expect(m.createJobOnChain).not.toHaveBeenCalled();
  });

  it("charges a wallet that signed this exact job, and records who paid", async () => {
    delete process.env.ALLOW_SERVICE_PAID_JOBS;
    const res = await postJob(await authBody());
    expect(res.status).toBe(200);
    expect(m.createJobOnChain).toHaveBeenCalledWith(FILE_HASH, 120, wallet.address);
    expect((await readStore()).jobs["1"].payer).toBe(wallet.address.toLowerCase());
  });

  it("works once: the same signature can't be replayed", async () => {
    const body = await authBody();
    expect((await postJob(body)).status).toBe(200);
    const again = await postJob(body);
    expect(again.status).toBe(409);
    expect(m.createJobOnChain).toHaveBeenCalledTimes(1);
  });

  it("tells a wallet without enough credit to deposit, instead of showing a chain error", async () => {
    m.createJobOnChain.mockRejectedValueOnce(new Error('execution reverted (unknown custom error) (action="estimateGas", data="0xf4d678b8")'));
    const res = await postJob(await authBody());
    expect(res.status).toBe(402);
    expect((await res.json()).error).toContain("enough credit");
  });

  it("rejects a signature made by a different wallet than userAddress", async () => {
    const other = ethers.Wallet.createRandom();
    const res = await postJob({ ...(await authBody()), userAddress: other.address });
    expect(res.status).toBe(403);
    expect(m.createJobOnChain).not.toHaveBeenCalled();
  });

  it("rejects a signature for a different document, lifespan or price", async () => {
    const otherHash = ethers.keccak256(ethers.toUtf8Bytes("another document"));
    expect((await postJob(await authBody(wallet, { fileHash: otherHash }))).status).toBe(403);
    expect((await postJob(await authBody(wallet, { ttl: 999 }))).status).toBe(403);
    expect((await postJob(await authBody(wallet, { price: "0.1" }))).status).toBe(403);
    expect(m.createJobOnChain).not.toHaveBeenCalled();
  });

  it("rejects a signature for another contract or chain", async () => {
    expect((await postJob(await authBody(wallet, { contract: ethers.Wallet.createRandom().address }))).status).toBe(403);
    expect((await postJob(await authBody(wallet, { chainId: 1 }))).status).toBe(403);
  });

  it("rejects an expired signature, one valid for too long, and a missing or malformed one", async () => {
    expect((await postJob(await authBody(wallet, { validUntil: now() - 1 }))).status).toBe(401);
    expect((await postJob(await authBody(wallet, { validUntil: now() + 100000 }))).status).toBe(400);
    expect((await postJob({ ...(await authBody()), signature: undefined })).status).toBe(401);
    expect((await postJob({ ...(await authBody()), signature: "0x1234" })).status).toBe(401);
    expect((await postJob({ ...(await authBody()), nonce: "nonce" })).status).toBe(400);
    expect(m.createJobOnChain).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
// The three calls are tied to one paid job: reading and signing can't be used on their own.
// ---------------------------------------------------------------------------------------------
describe("jobs are bound to infer and result", () => {
  beforeEach(() => {
    vi.mocked(failJobOnChain).mockClear();
  });

  it("reads only for a job that exists, with its token", async () => {
    await postJob(jobReq);
    expect((await inferReq(inferBody, "")).status).toBe(401);
    expect((await inferReq(inferBody, "wrong-token")).status).toBe(403);
    expect((await inferReq({ ...inferBody, jobId: "99" })).status).toBe(404);
    expect((await inferReq({ ...inferBody, jobId: "abc" })).status).toBe(400);
    expect(m.inference).not.toHaveBeenCalled();
  });

  it("reads only the document the job was opened with", async () => {
    await postJob(jobReq);
    const res = await inferReq({ ...inferBody, content: "A different document" });
    expect(res.status).toBe(403);
    expect(m.inference).not.toHaveBeenCalled();
  });

  it("reads a job once", async () => {
    await postJob(jobReq);
    expect((await inferReq(inferBody)).status).toBe(200);
    expect((await inferReq(inferBody)).status).toBe(409);
    expect(m.inference).toHaveBeenCalledTimes(1);
  });

  it("stops after three failed tries", async () => {
    await postJob(jobReq);
    m.inference.mockResolvedValue({ chatId: "c", content: "", provider: "p", requestId: "r", finishReason: "length" });
    for (let i = 0; i < 3; i++) expect((await inferReq(inferBody)).status).toBe(502);
    expect((await inferReq(inferBody)).status).toBe(409); // the job is failed now, so nothing more is spent on it
    expect(m.inference).toHaveBeenCalledTimes(3);
  });

  it("fails the job on-chain after the last failed try, so the payment is refundable at once", async () => {
    await postJob(jobReq);
    m.inference.mockRejectedValue(new Error("upstream_error EOF"));
    for (let i = 0; i < 2; i++) expect((await inferReq(inferBody)).status).toBe(502);
    expect(failJobOnChain).not.toHaveBeenCalled(); // still has a try left
    expect((await readStore()).jobs["1"].status).toBe("processing");
    expect((await inferReq(inferBody)).status).toBe(502);
    expect(failJobOnChain).toHaveBeenCalledWith(1, expect.stringContaining("3 tries"));
    expect((await readStore()).jobs["1"].status).toBe("failed");
    m.chain = { status: "Failed", deadline: now() + 3000 }; // well before the timeout
    expect(await refundFailedJobs()).toEqual(["1"]);
  });

  it("signs only the enclave's own answer for the job", async () => {
    const created = await (await postJob(jobReq)).json();
    const i = await (await inferReq(inferBody)).json();
    m.chain.status = "Pending";
    const other = ethers.keccak256(ethers.toUtf8Bytes("something the enclave never said"));
    const base = { encryptedResult: "E", resultHash: i.resultHash, attestationHash: i.attestationHash, chatId: i.chatId };
    expect((await storeResultReq(created.jobId, { ...base, resultHash: other }, created.accessToken)).status).toBe(403);
    expect((await storeResultReq(created.jobId, { ...base, attestationHash: other }, created.accessToken)).status).toBe(403);
    expect((await storeResultReq(created.jobId, { ...base, chatId: "forged-chat" }, created.accessToken)).status).toBe(403);
    expect(m.completeJobOnChain).not.toHaveBeenCalled();
    expect((await storeResultReq(created.jobId, base, created.accessToken)).status).toBe(200);
  });

  it("does not sign for a job that was never read", async () => {
    const created = await (await postJob(jobReq)).json();
    m.chain.status = "Pending";
    const res = await storeResultReq(created.jobId, { encryptedResult: "E", resultHash: RESULT_HASH, attestationHash: ATT_HASH, chatId: "chat-1" }, created.accessToken);
    expect(res.status).toBe(409);
    expect(m.completeJobOnChain).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
// Task board #75: the browser's key-wipe receipt is anchored on-chain, then the server forgets the rest.
// ---------------------------------------------------------------------------------------------
describe("key-wipe anchoring (#75)", () => {
  const wipe = () => ({ keyId: "k_abc123", expiryTimestamp: now() - 10, destructionTimestamp: now() - 5, status: "wiped" });
  const destroyedReq = (id: string, body: unknown, token = "") =>
    postDestroyed(
      new NextRequest(`http://localhost/api/jobs/${id}/destroyed`, { method: "POST", body: JSON.stringify(body), headers: token ? { "x-access-token": token } : {} }),
      ctx(id),
    );
  beforeEach(() => {
    vi.mocked(markKeyDestroyedOnChain).mockReset().mockResolvedValue("0xdestroykeytx");
  });

  it("anchors the receipt's hash on-chain, exposes it, and drops the token and file name", async () => {
    const { id, accessToken } = await createAndComplete();
    const w = wipe();
    const res = await destroyedReq(id, w, accessToken);
    expect(res.status).toBe(200);
    const body = await res.json();
    const expected = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify([id, w.keyId, w.expiryTimestamp, w.destructionTimestamp, "wiped"])));
    expect(body).toEqual({ receiptHash: expected, anchorTxHash: "0xdestroykeytx" });
    expect(markKeyDestroyedOnChain).toHaveBeenCalledWith(Number(id), expected);

    const row = (await readStore()).jobs[id];
    expect(row.accessToken).toBeUndefined();
    expect(row.fileName).toBe("[removed]");
    expect(storeText()).not.toContain(accessToken);
    expect(storeText()).not.toContain("report.txt");

    const job = await (await get(id, accessToken)).json();
    expect(job.keyWipe).toMatchObject({ receiptHash: expected, anchorTxHash: "0xdestroykeytx" });
    expect(job.encryptedResult).toBeNull(); // the token is gone, so nothing is served
  });

  it("is idempotent and can't be replaced by a different receipt", async () => {
    const { id, accessToken } = await createAndComplete();
    const first = await (await destroyedReq(id, wipe(), accessToken)).json();
    // the token is gone after the first call, so a retry needs the grace-period token: restore it as the server would still have it
    await withStore((d) => { d.jobs[id].accessToken = accessToken; });
    const again = await (await destroyedReq(id, { ...wipe(), keyId: "k_other" }, accessToken)).json();
    expect(again).toEqual(first);
    expect(markKeyDestroyedOnChain).toHaveBeenCalledTimes(1);
  });

  it("needs the job's token and a completed job, and a sane receipt", async () => {
    const { id, accessToken } = await createAndComplete();
    expect((await destroyedReq(id, wipe())).status).toBe(401);
    expect((await destroyedReq(id, wipe(), "wrong")).status).toBe(403);
    expect((await destroyedReq(id, { ...wipe(), status: "destroyed" }, accessToken)).status).toBe(400);
    expect((await destroyedReq(id, { ...wipe(), destructionTimestamp: now() + 9999 }, accessToken)).status).toBe(400);
    expect((await destroyedReq(id, { ...wipe(), keyId: "bad key!" }, accessToken)).status).toBe(400);
    expect((await destroyedReq("abc", wipe(), accessToken)).status).toBe(400);

    const opened = await (await postJob(jobReq)).json(); // never completed
    expect((await destroyedReq(opened.jobId, wipe(), opened.accessToken)).status).toBe(409);
    expect(markKeyDestroyedOnChain).not.toHaveBeenCalled();
  });

  it("reports a job whose lifetime hasn't ended on-chain yet", async () => {
    const { id, accessToken } = await createAndComplete();
    vi.mocked(markKeyDestroyedOnChain).mockRejectedValueOnce(new Error("execution reverted: JobNotExpired()"));
    const res = await destroyedReq(id, wipe(), accessToken);
    expect(res.status).toBe(409);
    expect((await readStore()).jobs[id].accessToken).toBe(accessToken); // nothing scrubbed on failure
  });
});

describe("cron and expiry scrub", () => {
  const cron = (auth?: string) => postCron(new NextRequest("http://localhost/api/cron/expire", { method: "POST", headers: auth ? { authorization: auth } : {} }));

  it("is closed when CRON_SECRET isn't set, and needs the secret when it is", async () => {
    delete process.env.CRON_SECRET;
    expect((await cron()).status).toBe(503);
    expect((await cron("Bearer anything")).status).toBe(503);
    process.env.CRON_SECRET = "s3cret-value";
    expect((await cron()).status).toBe(401);
    expect((await cron("Bearer wrong")).status).toBe(401);
    expect((await cron("Bearer s3cret-value")).status).toBe(200);
    delete process.env.CRON_SECRET;
  });

  it("removes the token and file name an hour after a job expires, and nothing sooner", async () => {
    const a = await createAndComplete();
    const b = (await createAndComplete()).id;
    await withStore((d) => {
      d.jobs[a.id].expiresAt = now() - 3601;
      d.jobs[b].expiresAt = now() - 60;
    });
    expect(await scrubExpiredJobs()).toEqual([a.id]);
    const s = await readStore();
    expect(s.jobs[a.id].accessToken).toBeUndefined();
    expect(s.jobs[a.id].fileName).toBe("[removed]");
    expect(s.jobs[b].accessToken).toBeTruthy();
    expect(s.jobs[b].fileName).toBe("report.txt");
    expect(await scrubExpiredJobs()).toEqual([]);
  });

  it("refunds a job that was opened and then abandoned, once its deadline passes", async () => {
    await postJob(jobReq); // browser never came back: the row stays "processing"
    m.chain = { status: "Pending", deadline: now() - 5 };
    expect(await refundFailedJobs()).toEqual(["1"]);
    expect((await readStore()).jobs["1"].refund).toMatchObject({ state: "REFUNDED" });
  });

  it("never refunds a job whose answer was already delivered", async () => {
    await postJob(jobReq);
    expect((await inferReq(inferBody)).status).toBe(200); // the user has the answer now, and never stores it
    m.chain = { status: "Pending", deadline: now() - 5 };
    expect(await refundFailedJobs()).toEqual([]);
    expect(m.refundJobOnChain).not.toHaveBeenCalled();
  });

  it("completes a delivered but unstored job itself, only after the wait and before the deadline", async () => {
    await postJob(jobReq);
    await inferReq(inferBody);
    m.chain = { status: "Pending", deadline: now() + 3000 };
    expect(await settleDeliveredJobs()).toEqual([]); // too soon
    expect(m.completeJobOnChain).not.toHaveBeenCalled();

    const later = now() + SETTLE_AFTER_SECONDS + 5;
    expect(await settleDeliveredJobs(later)).toEqual(["1"]);
    expect(m.completeJobOnChain).toHaveBeenCalledWith(1, RESULT_HASH, ATT_HASH, expect.stringMatching(/^0x/));
    const row = (await readStore()).jobs["1"];
    expect(row.status).toBe("completed");
    expect(row.completeTxHash).toBe("0xcompletetx");
    expect(await settleDeliveredJobs(later)).toEqual([]); // once
  });

  it("leaves a delivered job alone once the contract won't accept a completion", async () => {
    await postJob(jobReq);
    await inferReq(inferBody);
    m.chain = { status: "Pending", deadline: now() - 5 };
    expect(await settleDeliveredJobs(now() + SETTLE_AFTER_SECONDS + 5)).toEqual([]);
    expect(m.completeJobOnChain).not.toHaveBeenCalled();
  });

  it("doesn't touch an abandoned job before its deadline", async () => {
    await postJob(jobReq);
    m.chain = { status: "Pending", deadline: now() + 600 };
    expect(await refundFailedJobs()).toEqual([]);
    expect(m.refundJobOnChain).not.toHaveBeenCalled();
  });
});
