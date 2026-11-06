import { NextRequest, NextResponse } from "next/server";
import { getJobOnChain } from "@/lib/contract";
import { verifyDestructionReceipt } from "@/lib/keystore";
import { readStore } from "@/lib/store";
import { safeErrorMessage } from "@/lib/redact";
import type { JobReceipt } from "@/lib/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const jobId = parseInt(id, 10);
    if (isNaN(jobId) || jobId < 1) return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });

    const job = await getJobOnChain(jobId);
    if (job.status === "None") return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const store = await readStore();
    const row = store.jobs[String(jobId)];
    const destruction = store.receipts[String(jobId)] ?? null;

    const receipt: JobReceipt & { destructionReceiptValid: boolean | null } = {
      jobId: String(jobId),
      requestId: row?.requestId ?? null,
      createTxHash: row?.createTxHash ?? null,
      completeTxHash: row?.completeTxHash ?? null,
      attestationHash: job.attestationHash,
      resultHash: job.resultHash,
      fileHash: job.fileHash,
      arkivEntityKey: row?.arkivEntityKey ?? null,
      expiresAt: row?.expiresAt ?? null,
      destruction,
      keyWipe: row?.keyWipe ?? null,
      destructionReceiptValid: destruction ? verifyDestructionReceipt(destruction) : null,
    };
    return NextResponse.json(receipt);
  } catch (err) {
    return NextResponse.json({ error: safeErrorMessage(err) }, { status: 500 });
  }
}
