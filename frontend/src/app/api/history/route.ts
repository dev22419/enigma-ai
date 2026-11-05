import { NextRequest, NextResponse } from "next/server";
import { getJobHistory } from "@/lib/contract";

export async function GET(req: NextRequest) {
  try {
    const address = req.nextUrl.searchParams.get("address");
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json(
        { error: "Valid wallet address required" },
        { status: 400 }
      );
    }

    const jobs = await getJobHistory(address);

    return NextResponse.json({
      address,
      totalJobs: jobs.length,
      jobs: jobs.map((job, i) => ({
        jobId: i + 1,
        status: job.status,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        expirySeconds: job.expirySeconds,
        payment: job.payment,
        fileHash: job.fileHash,
        resultHash: job.resultHash,
        attestationHash: job.attestationHash,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
