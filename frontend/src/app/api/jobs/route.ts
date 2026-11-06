import { NextRequest, NextResponse } from "next/server";
import { TASK_TYPES, MIN_TTL_SECONDS, MAX_TTL_SECONDS } from "@/lib/constants";
import { runInference, getTeeAttestation } from "@/lib/og-inference";
import { signJobCompletion, hashContent } from "@/lib/oracle-signer";
import { createJobOnChain, completeJobOnChain, getJobOnChain } from "@/lib/contract";
import { storeInArkiv } from "@/lib/arkiv";
import { encrypt, serializeEnvelope } from "@/lib/crypto";
import { createKey, setKeyExpiry, destroyKey } from "@/lib/keystore";
import { withStore } from "@/lib/store";
import { configProblems } from "@/lib/preflight";
import { safeErrorMessage } from "@/lib/redact";
import { storageConfigured, uploadCiphertext } from "@/lib/storage";
import type { CreateJobRequest, CreateJobResponse } from "@/lib/types";

// Roughly 8 MB of text or base64. A hard cap so one request cannot exhaust memory or the 0G budget.
const MAX_FILE_CHARS = 8_000_000;

// Every message that leaves this route is scrubbed: upstream errors can echo request bodies.
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
  if (typeof body.fileContent !== "string" || typeof body.fileName !== "string" || !body.fileContent || !body.fileName) {
    return fail(400, "fileContent and fileName are required");
  }
  if (body.fileContent.length > MAX_FILE_CHARS) {
    return fail(413, `fileContent is too large (limit ${MAX_FILE_CHARS} characters)`);
  }
  if (!Number.isInteger(body.ttl) || body.ttl < MIN_TTL_SECONDS || body.ttl > MAX_TTL_SECONDS) {
    return fail(400, `ttl must be a whole number of seconds between ${MIN_TTL_SECONDS} and ${MAX_TTL_SECONDS}`);
  }

  // Refuse before touching the chain, so a bad key cannot leave a locked payment behind.
  const problems = configProblems();
  if (problems.length) return fail(503, `Server is not configured: ${problems.join("; ")}`);

  const fileHash = hashContent(body.fileContent);
  const now = () => Math.floor(Date.now() / 1000);

  // 1. Open the job on-chain (locks the query price from the prepaid balance).
  let jobId: number;
  let createTxHash: string;
  try {
    ({ jobId, txHash: createTxHash } = await createJobOnChain(fileHash, body.ttl));
  } catch (err) {
    return fail(502, `Could not create the job on-chain: ${safeErrorMessage(err)}`);
  }
  const id = String(jobId);

  // 2. One-time key for this job. Provisional expiry; replaced by Arkiv's own below.
  const { keyId, key } = await createKey(id, now() + body.ttl + 120);
  await withStore((d) => {
    d.jobs[id] = {
      jobId: id, taskType: body.taskType, fileName: body.fileName, fileHash,
      inputCiphertextHash: null, resultHash: null, attestationHash: null, requestId: null,
      arkivEntityKey: null, createTxHash, completeTxHash: null, status: "processing",
      error: null, createdAt: now(), expiresAt: null,
    };
  });

  // Any failure from here: stop, destroy the key, leave the job uncompleted so
  // the on-chain timeout refund returns the payment. Never report a success we
  // did not achieve.
  const abort = async (status: number, rawMessage: string) => {
    const message = safeErrorMessage(rawMessage);
    key.fill(0);
    await withStore((d) => {
      if (d.jobs[id]) { d.jobs[id].status = "failed"; d.jobs[id].error = message; }
    });
    await destroyKey(id).catch(() => undefined);
    return fail(status, message, { jobId: id, refund: "call refundJob after the job timeout" });
  };

  try {
    // 3. Encrypt the input. The ciphertext hash is recorded; the blob is destined for 0G Storage.
    const inputEnvelope = encrypt(key, keyId, body.fileContent, { jobId: id, objectType: "input" });
    const inputCiphertextHash = hashContent(serializeEnvelope(inputEnvelope));

    // 3b. Store the encrypted input on 0G Storage (opt-in via ZG_STORAGE_INDEXER). Fails closed:
    //     if storage is switched on and the upload fails, the job fails and is refunded.
    let inputStorage: { rootHash: string; txHash: string } | null = null;
    if (storageConfigured()) {
      inputStorage = await uploadCiphertext(serializeEnvelope(inputEnvelope));
      await withStore((d) => { if (d.jobs[id]) d.jobs[id].inputStorage = inputStorage; });
    }

    // 4. Private inference on 0G with TEE verification.
    const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(body.fileName);
    const { chatId, content, provider, requestId } = await runInference(
      body.taskType, body.fileContent, isImage ? body.fileContent : undefined
    );
    if (!chatId) return abort(502, "0G returned no request id, so the run cannot be verified");

    const attestation = await getTeeAttestation(chatId, provider, requestId);
    if (!attestation) return abort(502, "TEE attestation unavailable, cannot verify inference integrity");
    const attestationHash = hashContent(attestation);
    const resultHash = hashContent(content);

    // 5. Encrypt the result and store ONLY the ciphertext in Arkiv. A failed
    //    write fails the request.
    const resultEnvelope = encrypt(key, keyId, content, { jobId: id, objectType: "result" });
    const arkiv = await storeInArkiv(id, serializeEnvelope(resultEnvelope), body.ttl);
    await setKeyExpiry(id, arkiv.expiresAtUnix);

    // 6. Oracle signs, contract completes (only after the data is safely stored).
    const onChainJob = await getJobOnChain(jobId);
    const signature = await signJobCompletion({
      jobId: BigInt(jobId), user: onChainJob.user, fileHash: onChainJob.fileHash,
      resultHash, attestationHash,
    });
    const completeTxHash = await completeJobOnChain(jobId, resultHash, attestationHash, signature);

    await withStore((d) => {
      Object.assign(d.jobs[id], {
        inputCiphertextHash, resultHash, attestationHash, requestId: chatId,
        arkivEntityKey: arkiv.entityKey, completeTxHash, status: "completed",
        expiresAt: arkiv.expiresAtUnix,
      });
    });

    key.fill(0);
    const response: CreateJobResponse = {
      jobId: id, status: "completed", result: content, requestId: chatId,
      attestationHash, createTxHash, txHash: completeTxHash,
      arkivEntityKey: arkiv.entityKey, keyId, expiresAt: arkiv.expiresAtUnix,
    };
    return NextResponse.json(response);
  } catch (err) {
    return abort(502, safeErrorMessage(err));
  }
}
