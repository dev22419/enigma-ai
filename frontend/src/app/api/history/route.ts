import { NextRequest, NextResponse } from "next/server";
import { getJobHistory } from "@/lib/contract";
import { destroyExpiredKeys, verifyDestructionReceipt } from "@/lib/keystore";
import { safeErrorMessage } from "@/lib/redact";
import { readStore } from "@/lib/store";

// Past jobs for a wallet: on-chain facts joined with the local key lifecycle. It carries hashes,
// ids, timestamps and states only, never results or key material, so it is safe to keep after expiry.
export async function GET(req: NextRequest) {
  try {
    const address = req.nextUrl.searchParams.get("address");
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json(
        { error: "Valid wallet address required" },
        { status: 400 }
      );
    }

    await destroyExpiredKeys();
    const [jobs, store] = await Promise.all([getJobHistory(address), readStore()]);

    return NextResponse.json({
      address,
      totalJobs: jobs.length,
      jobs: jobs.map((job) => {
        const id = String(job.jobId);
        const row = store.jobs[id] ?? null;
        const key = store.keys[id] ?? null;
        const receipt = store.receipts[id] ?? null;
        return {
          jobId: job.jobId,
          status: job.status,
          createdAt: job.createdAt,
          completedAt: job.completedAt,
          expirySeconds: job.expirySeconds,
          payment: job.payment,
          fileHash: job.fileHash,
          resultHash: job.resultHash,
          attestationHash: job.attestationHash,
          // local lifecycle
          requestId: row?.requestId ?? null,
          createTxHash: row?.createTxHash ?? null,
          completeTxHash: row?.completeTxHash ?? null,
          arkivEntityKey: row?.arkivEntityKey ?? null,
          inputStorage: row?.inputStorage ?? null,
          expiresAt: row?.expiresAt ?? null,
          error: row?.error ?? null,
          refund: row?.refund ?? null,
          keyState: key?.state ?? null,
          keyDestroyed: key?.state === "DESTROYED",
          destruction: receipt
            ? {
                destructionTimestamp: receipt.destructionTimestamp,
                receiptHash: receipt.receiptHash,
                signer: receipt.signer,
                valid: verifyDestructionReceipt(receipt),
              }
            : null,
        };
      }),
    });
  } catch (err) {
    return NextResponse.json({ error: safeErrorMessage(err) }, { status: 500 });
  }
}
