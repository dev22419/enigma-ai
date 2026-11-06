import { NextRequest, NextResponse } from "next/server";
import { TASK_TYPES } from "@/lib/constants";
import { runInference, getTeeAttestation, mimeTypeFromFileName } from "@/lib/og-inference";
import { hashContent } from "@/lib/oracle-signer";
import { safeErrorMessage } from "@/lib/redact";
import { tokensEqual } from "@/lib/crypto";
import { readStore, withStore } from "@/lib/store";
import { failJobOnChain } from "@/lib/contract";
import type { InferRequest, InferResponse } from "@/lib/types";

const MAX_CONTENT_CHARS = 8_000_000;

function fail(status: number, error: string) {
  return NextResponse.json({ error: safeErrorMessage(error) }, { status });
}

export async function POST(req: NextRequest) {
  let body: InferRequest;
  try {
    body = await req.json();
  } catch {
    return fail(400, "Body must be JSON");
  }

  if (!TASK_TYPES.includes(body.taskType)) {
    return fail(400, `Invalid taskType. Must be one of: ${TASK_TYPES.join(", ")}`);
  }
  if (typeof body.content !== "string" || !body.content) {
    return fail(400, "content is required");
  }
  if (body.content.length > MAX_CONTENT_CHARS) {
    return fail(413, `content is too large (limit ${MAX_CONTENT_CHARS} characters)`);
  }
  if (typeof body.fileName !== "string" || !body.fileName) {
    return fail(400, "fileName is required");
  }
  if (typeof body.jobId !== "string" || !/^\d+$/.test(body.jobId)) {
    return fail(400, "jobId is required");
  }

  // Reading costs real 0G credit, so it only runs for a job that was opened and paid for,
  // for the exact document that job was opened with, and only a few times.
  const token = req.headers.get("x-access-token") ?? "";
  if (!token) return fail(401, "Missing x-access-token header");
  const row = (await readStore()).jobs[body.jobId];
  if (!row) return fail(404, "Job not found");
  if (!row.accessToken || !tokensEqual(token, row.accessToken)) return fail(403, "Invalid access token");
  if (row.status !== "processing") return fail(409, `Job is ${row.status}`);
  if (hashContent(body.content) !== row.fileHash) {
    return fail(403, "This document isn't the one the job was opened for");
  }
  const claimedAt = Math.floor(Date.now() / 1000);
  const claim = await withStore((d) => {
    const r = d.jobs[body.jobId];
    if (!r) return "missing" as const;
    if (r.inferred) return "done" as const;
    if (r.inferring && claimedAt - r.inferring < 180) return "busy" as const;
    if ((r.inferAttempts ?? 0) >= 3) return "limit" as const;
    r.inferring = claimedAt;
    r.inferAttempts = (r.inferAttempts ?? 0) + 1;
    return "ok" as const;
  });
  if (claim === "done") return fail(409, "This job was already read");
  if (claim === "busy") return fail(409, "This job is already being read");
  if (claim === "limit") return fail(429, "Too many attempts for this job");
  if (claim === "missing") return fail(404, "Job not found");
  // A failed reading frees the job for another try. After the last allowed try the job is failed on-chain,
  // which makes the payment refundable at once instead of after the timeout.
  const release = async (reason = "inference failed") => {
    const spent = await withStore((d) => {
      const r = d.jobs[body.jobId];
      if (!r) return false;
      r.inferring = undefined;
      if ((r.inferAttempts ?? 0) >= 3) {
        r.status = "failed";
        r.error = safeErrorMessage(reason);
        return true;
      }
      return false;
    });
    if (spent) await failJobOnChain(Number(body.jobId), "inference failed after 3 tries").catch(() => undefined);
  };

  try {
    const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(body.fileName);
    const inference = await runInference(
      body.taskType,
      body.content,
      isImage ? body.content : undefined,
      mimeTypeFromFileName(body.fileName)
    );

    if (!inference.chatId) {
      await release();
      return fail(502, "0G returned no request id, so the run cannot be verified");
    }
    if (!inference.content.trim()) {
      await release();
      return fail(502, "0G returned an empty result (the model may have run out of tokens)");
    }

    const result =
      inference.finishReason === "length"
        ? `${inference.content}\n\n[Output truncated: the model reached its length limit.]`
        : inference.content;

    const attestation = await getTeeAttestation(
      inference.chatId,
      inference.provider,
      inference.requestId
    );
    if (!attestation) {
      await release();
      return fail(502, "TEE attestation unavailable, cannot verify inference integrity");
    }

    const response: InferResponse = {
      result,
      chatId: inference.chatId,
      resultHash: hashContent(result),
      attestationHash: hashContent(attestation),
      provider: inference.provider,
      requestId: inference.requestId,
    };
    // Remember what the enclave said. The result route will only sign for these exact values.
    await withStore((d) => {
      const r = d.jobs[body.jobId];
      if (r) {
        r.inferred = { resultHash: response.resultHash, attestationHash: response.attestationHash, chatId: response.chatId, at: claimedAt };
        r.inferring = undefined;
      }
    });
    return NextResponse.json(response);
  } catch (err) {
    await release(safeErrorMessage(err));
    return fail(502, safeErrorMessage(err));
  }
}
