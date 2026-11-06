import { NextRequest, NextResponse } from "next/server";
import { TASK_TYPES, MIN_TTL_SECONDS, MAX_TTL_SECONDS } from "@/lib/constants";
import { createJobOnChain } from "@/lib/contract";
import { randomToken } from "@/lib/crypto";
import { withStore } from "@/lib/store";
import { configProblems } from "@/lib/preflight";
import { safeErrorMessage } from "@/lib/redact";
import { storageConfigured, uploadCiphertext } from "@/lib/storage";
import type { CreateJobRequest, CreateJobResponse } from "@/lib/types";

const MAX_CIPHERTEXT_CHARS = 12_000_000;

function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: safeErrorMessage(error), ...extra }, { status });
}

export async function POST(req: NextRequest) {
  let body: CreateJobRequest;
  try {
    body = await req.json();
  } catch {
    return fail(400, "Body must be JSON");
  }

  if (!TASK_TYPES.includes(body.taskType)) {
    return fail(400, `Invalid taskType. Must be one of: ${TASK_TYPES.join(", ")}`);
  }
  if (typeof body.fileName !== "string" || !body.fileName) {
    return fail(400, "fileName is required");
  }
  if (typeof body.fileHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(body.fileHash)) {
    return fail(400, "fileHash must be a 0x-prefixed keccak256 hash");
  }
  if (typeof body.encryptedFile !== "string" || !body.encryptedFile) {
    return fail(400, "encryptedFile is required (ciphertext from browser)");
  }
  if (body.encryptedFile.length > MAX_CIPHERTEXT_CHARS) {
    return fail(413, `encryptedFile is too large (limit ${MAX_CIPHERTEXT_CHARS} characters)`);
  }
  if (!Number.isInteger(body.ttl) || body.ttl < MIN_TTL_SECONDS || body.ttl > MAX_TTL_SECONDS) {
    return fail(400, `ttl must be a whole number of seconds between ${MIN_TTL_SECONDS} and ${MAX_TTL_SECONDS}`);
  }
  if (body.userAddress !== undefined && (typeof body.userAddress !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(body.userAddress))) {
    return fail(400, "userAddress must be a valid Ethereum address");
  }

  const problems = configProblems();
  if (problems.length) return fail(503, `Server is not configured: ${problems.join("; ")}`);

  const now = () => Math.floor(Date.now() / 1000);

  let jobId: number;
  let createTxHash: string;
  try {
    ({ jobId, txHash: createTxHash } = await createJobOnChain(body.fileHash, body.ttl, body.userAddress));
  } catch (err) {
    return fail(502, `Could not create the job on-chain: ${safeErrorMessage(err)}`);
  }
  const id = String(jobId);

  let inputStorage: { rootHash: string; txHash: string } | null = null;
  if (storageConfigured()) {
    try {
      inputStorage = await uploadCiphertext(body.encryptedFile);
    } catch (err) {
      return fail(502, `Could not upload ciphertext to 0G Storage: ${safeErrorMessage(err)}`);
    }
  }

  const accessToken = randomToken();
  await withStore((d) => {
    d.jobs[id] = {
      jobId: id,
      taskType: body.taskType,
      fileName: body.fileName,
      fileHash: body.fileHash,
      inputCiphertextHash: null,
      resultHash: null,
      attestationHash: null,
      requestId: null,
      arkivEntityKey: null,
      createTxHash,
      completeTxHash: null,
      status: "processing",
      error: null,
      createdAt: now(),
      expiresAt: null,
      accessToken,
      inputStorage: inputStorage ?? undefined,
    };
  });

  const response: CreateJobResponse = { jobId: id, createTxHash, inputStorage, accessToken };
  return NextResponse.json(response);
}
