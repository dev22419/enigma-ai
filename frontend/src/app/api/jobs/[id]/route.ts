import { NextRequest, NextResponse } from "next/server";
import { getJobOnChain } from "@/lib/contract";
import { fetchFromArkiv } from "@/lib/arkiv";
import { decrypt, type EncryptedPayload } from "@/lib/crypto";
import { getKeyByJobId, getDestructionReceipt } from "@/lib/key-store";
import { runExpiryCheck } from "@/lib/expiry-worker";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const jobId = parseInt(id, 10);
    if (isNaN(jobId) || jobId < 1) {
      return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
    }

    // Run expiry check on every read
    await runExpiryCheck().catch(() => {});

    const job = await getJobOnChain(jobId);
    if (job.status === "None") {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    let result: string | null = null;
    let expired = false;
    let keyDestroyed = false;

    const keyEntry = getKeyByJobId(String(jobId));
    const destructionReceipt = getDestructionReceipt(String(jobId));

    if (keyEntry?.state === "DESTROYED" || destructionReceipt) {
      keyDestroyed = true;
      expired = true;
    }

    if (job.status === "Completed" && !keyDestroyed) {
      const arkivData = await fetchFromArkiv(`job-${jobId}`).catch(() => null);
      if (arkivData?.exists && keyEntry?.state === "ACTIVE") {
        try {
          const payload: EncryptedPayload = JSON.parse(arkivData.data);
          result = decrypt(payload, keyEntry.keyMaterial);
        } catch {
          result = null;
        }
      } else if (!arkivData?.exists) {
        expired = true;
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
      result: expired ? null : result,
      expired,
      keyDestroyed,
      destructionReceipt: destructionReceipt ?? null,
      receipt: {
        jobId,
        txHash: null,
        attestationHash: job.attestationHash,
        resultHash: job.resultHash,
        fileHash: job.fileHash,
        expired,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
