import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getJobOnChain } from "@/lib/contract";
import { fetchFromArkiv } from "@/lib/arkiv";
import { decrypt, parseEnvelope } from "@/lib/crypto";
import { destroyExpiredKeys, getActiveKey } from "@/lib/keystore";
import { readStore } from "@/lib/store";
import { safeErrorMessage } from "@/lib/redact";

function tokenMatches(provided: string, stored: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(stored);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

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

    await destroyExpiredKeys();

    const job = await getJobOnChain(jobId);
    if (job.status === "None") {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const store = await readStore();
    const row = store.jobs[String(jobId)] ?? null;

    if (row?.accessToken) {
      const token = req.headers.get("x-access-token") || req.nextUrl.searchParams.get("token");
      if (!token || !tokenMatches(token, row.accessToken)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const keyRow = store.keys[String(jobId)] ?? null;
    const destruction = store.receipts[String(jobId)] ?? null;

    let result: string | null = null;
    let arkivExists = false;
    let ciphertextPreview: string | null = null;
    let expiresAt = row?.expiresAt ?? null;

    if (job.status === "Completed") {
      const arkiv = await fetchFromArkiv(String(jobId)).catch(() => null);
      arkivExists = !!arkiv?.exists;
      if (arkiv?.exists && arkiv.envelopeJson) {
        expiresAt = arkiv.expiresAtUnix;
        const env = parseEnvelope(arkiv.envelopeJson);
        ciphertextPreview = env.ciphertext.slice(0, 96);
        const active = await getActiveKey(String(jobId));
        if (active) {
          try {
            result = decrypt(active.key, env, { jobId: String(jobId), objectType: "result" }).toString("utf8");
          } finally {
            active.key.fill(0);
          }
        }
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
      result,
      keyState: keyRow?.state ?? null,
      keyDestroyed: keyRow?.state === "DESTROYED",
      arkivEntityExists: arkivExists,
      ciphertextPreview,
      destruction,
    });
  } catch (err) {
    const message = safeErrorMessage(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
