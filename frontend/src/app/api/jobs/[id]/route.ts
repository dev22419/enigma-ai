import { NextRequest, NextResponse } from "next/server";
import { getJobOnChain } from "@/lib/contract";
import { fetchFromArkiv } from "@/lib/arkiv";
import { tokensEqual, deriveAccessToken } from "@/lib/crypto";
import { readStore } from "@/lib/store";
import { safeErrorMessage } from "@/lib/redact";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const jobId = parseInt(id, 10);
    if (isNaN(jobId) || jobId < 1) {
      return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
    }

    const job = await getJobOnChain(jobId);
    if (job.status === "None") {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const store = await readStore();
    const row = store.jobs[String(jobId)] ?? null;
    const destruction = store.receipts[String(jobId)] ?? null;

    let encryptedResult: string | null = null;
    let arkivExists = false;
    let expiresAt = row?.expiresAt ?? null;

    const token = req.headers.get("x-access-token") ?? "";
    const expectedToken = deriveAccessToken(String(jobId));
    const authorized = !!token && tokensEqual(token, expectedToken);

    if (job.status === "Completed" && authorized && !row?.keyWipe) {
      const arkiv = await fetchFromArkiv(String(jobId)).catch(() => null);
      arkivExists = !!arkiv?.exists;
      if (arkiv?.exists && arkiv.envelopeJson) {
        expiresAt = arkiv.expiresAtUnix;
        encryptedResult = arkiv.envelopeJson;
      }
    }

    return NextResponse.json({
      jobId,
      user: job.user,
      status: job.status,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      expirySeconds: job.expirySeconds,
      payment: job.payment,
      fileHash: job.fileHash,
      resultHash: job.resultHash,
      attestationHash: job.attestationHash,
      requestId: row?.requestId ?? null,
      arkivEntityKey: row?.arkivEntityKey ?? null,
      inputStorage: row?.inputStorage ?? null,
      createTxHash: row?.createTxHash ?? null,
      completeTxHash: row?.completeTxHash ?? null,
      expiresAt,
      encryptedResult,
      arkivEntityExists: arkivExists,
      destruction,
      keyWipe: row?.keyWipe ?? null,
    });
  } catch (err) {
    const message = safeErrorMessage(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
