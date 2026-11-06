import { NextRequest, NextResponse } from "next/server";
import { TASK_TYPES } from "@/lib/constants";
import { runInference, getTeeAttestation, mimeTypeFromFileName } from "@/lib/og-inference";
import { hashContent } from "@/lib/oracle-signer";
import { safeErrorMessage } from "@/lib/redact";
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

  try {
    const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(body.fileName);
    const inference = await runInference(
      body.taskType,
      body.content,
      isImage ? body.content : undefined,
      mimeTypeFromFileName(body.fileName)
    );

    if (!inference.chatId) {
      return fail(502, "0G returned no request id, so the run cannot be verified");
    }
    if (!inference.content.trim()) {
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
    return NextResponse.json(response);
  } catch (err) {
    return fail(502, safeErrorMessage(err));
  }
}
