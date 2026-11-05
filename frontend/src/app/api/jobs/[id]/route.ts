import { NextRequest, NextResponse } from "next/server";
import { getJobOnChain } from "@/lib/contract";
import { fetchFromArkiv } from "@/lib/arkiv";

export async function GET(
  _req: NextRequest,
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

    let result: string | null = null;
    let expired = false;

    if (job.status === "Completed") {
      const arkivData = await fetchFromArkiv(`job-${jobId}`).catch(() => null);
      if (arkivData?.exists) {
        result = arkivData.data;
        const now = Math.floor(Date.now() / 1000);
        expired = arkivData.expiresAt > 0 && arkivData.expiresAt < now;
      } else {
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
