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
import { readStore } from "@/lib/store";
import { refundFailedJobs } from "@/lib/refunds";

const RESULT = "RESULT-SECRET-ABC high HbA1c, adjust medication";
const RESULT_HASH = ethers.keccak256(ethers.toUtf8Bytes(RESULT));
const ATT_HASH = ethers.keccak256(ethers.toUtf8Bytes("tee-attestation"));
const FILE_HASH = "0x5a9188787b5b9e1843d261277358102ac28f85e24bc5b4aef1a31dceaae52ab4";
const now = () => Math.floor(Date.now() / 1000);
let dataDir: string;
let logged: string[];

function postJob(body: unknown) {
  return POST(new NextRequest("http://localhost/api/jobs", { method: "POST", body: JSON.stringify(body) }));
}
function inferReq(body: unknown) {
  return postInfer(new NextRequest("http://localhost/api/infer", { method: "POST", body: JSON.stringify(body) }));
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
    m.chain.status = "Pending";
    m.completeJobOnChain.mockRejectedValueOnce(new Error("boom"));
    await storeResultReq(id1, { encryptedResult: "E", resultHash: RESULT_HASH, attestationHash: ATT_HASH, chatId: "c" }, tok1);

    m.chain = { status: "Refunded", deadline: now() - 5 };
    await refundFailedJobs();
    expect((await readStore()).jobs[id1].refund).toMatchObject({ state: "REFUNDED", txHash: null });

    const res2 = await postJob(jobReq);
    const { jobId: id2, accessToken: tok2 } = await res2.json();
    m.chain.status = "Pending";
    m.completeJobOnChain.mockRejectedValueOnce(new Error("boom"));
    await storeResultReq(id2, { encryptedResult: "E", resultHash: RESULT_HASH, attestationHash: ATT_HASH, chatId: "c" }, tok2);

    m.chain = { status: "Completed", deadline: now() - 5 };
    await refundFailedJobs();
    expect((await readStore()).jobs[id2].refund).toMatchObject({ state: "NOT_REQUIRED" });
    expect(m.refundJobOnChain).not.toHaveBeenCalled();
  });

  it("retries on the next pass when the refund transaction fails", async () => {
    const res = await postJob(jobReq);
    const { jobId: id, accessToken } = await res.json();
    m.chain.status = "Pending";
    m.completeJobOnChain.mockRejectedValueOnce(new Error("boom"));
    await storeResultReq(id, { encryptedResult: "E", resultHash: RESULT_HASH, attestationHash: ATT_HASH, chatId: "c" }, accessToken);

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
    const res = await inferReq(inferBody);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("empty result");
  });

  it("marks an answer that hit the length limit as truncated", async () => {
    m.inference.mockResolvedValue({ chatId: "c", content: "Partial analysis", provider: "p", requestId: "r", finishReason: "length" });
    const body = await (await inferReq(inferBody)).json();
    expect(body.result).toContain("Partial analysis");
    expect(body.result).toContain("[Output truncated");
  });

  it("leaves a complete answer untouched", async () => {
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
        body: JSON.stringify({ encryptedResult: "E", resultHash: RESULT_HASH, attestationHash: ATT_HASH, chatId: "c" }),
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
