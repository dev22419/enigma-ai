import { NextRequest, NextResponse } from "next/server";
import { TASK_TYPES } from "@/lib/constants";
import { runInference, getTeeAttestation } from "@/lib/og-inference";
import { signJobCompletion, hashContent } from "@/lib/oracle-signer";
import type { CreateJobRequest, CreateJobResponse } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body: CreateJobRequest = await req.json();

    if (!TASK_TYPES.includes(body.taskType)) {
      return NextResponse.json(
        { error: `Invalid taskType. Must be one of: ${TASK_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    if (!body.fileContent || !body.fileName) {
      return NextResponse.json(
        { error: "fileContent and fileName are required" },
        { status: 400 }
      );
    }

    if (!body.ttl || body.ttl < 60 || body.ttl > 86400) {
      return NextResponse.json(
        { error: "ttl must be between 60 and 86400 seconds" },
        { status: 400 }
      );
    }

    const fileHash = hashContent(body.fileContent);

    const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(body.fileName);
    const { chatId, content } = await runInference(
      body.taskType,
      body.fileContent,
      isImage ? body.fileContent : undefined
    );

    const resultHash = hashContent(content);

    const attestation = await getTeeAttestation(chatId);
    if (!attestation) {
      return NextResponse.json(
        { error: "TEE attestation unavailable — cannot verify inference integrity" },
        { status: 502 }
      );
    }
    const attestationHash = hashContent(attestation);

    // TODO: call contract.createJob on-chain once contract is deployed
    // TODO: store in Arkiv with TTL
    // TODO: call contract.completeJob with oracle signature

    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Math.floor(Date.now() / 1000);

    const response: CreateJobResponse = {
      jobId,
      status: "completed",
      result: content,
      txHash: null,
      attestationHash,
      expiresAt: now + body.ttl,
    };

    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
