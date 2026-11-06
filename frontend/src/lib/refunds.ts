// AI-assisted: Used Claude to draft the refund worker
import { getJobOnChain, refundJobOnChain } from "./contract";
import { readStore, withStore } from "./store";

const g = globalThis as unknown as { __enigmaRefunding?: boolean };

// A job that failed after payment was locked is never completed, so the contract's timeout
// refund is the only way the company gets its credit back. This closes that loop: once the
// on-chain deadline passes, send refundJob (anyone may call it) and record the outcome.
// Safe to run repeatedly; a job is only refunded once.
export async function refundFailedJobs(now = Math.floor(Date.now() / 1000)): Promise<string[]> {
  if (g.__enigmaRefunding) return [];
  g.__enigmaRefunding = true;
  const refunded: string[] = [];
  try {
    const { jobs } = await readStore();
    const pending = Object.values(jobs).filter((j) => j.status === "failed" && !j.refund);
    for (const j of pending) {
      try {
        const chain = await getJobOnChain(Number(j.jobId));
        if (chain.status === "Refunded") {
          await record(j.jobId, { state: "REFUNDED", txHash: null, at: now });
        } else if (chain.status === "Completed") {
          await record(j.jobId, { state: "NOT_REQUIRED", txHash: null, at: now });
        } else if ((chain.status === "Pending" || chain.status === "Processing" || chain.status === "Failed") && now > chain.deadline) {
          const txHash = await refundJobOnChain(Number(j.jobId));
          await record(j.jobId, { state: "REFUNDED", txHash, at: now });
          refunded.push(j.jobId);
        }
        // else: deadline not reached yet; try again next pass
      } catch {
        // leave it unrecorded so the next pass retries
      }
    }
  } finally {
    g.__enigmaRefunding = false;
  }
  return refunded;
}

async function record(jobId: string, refund: NonNullable<import("./store").JobRow["refund"]>) {
  await withStore((d) => {
    if (d.jobs[jobId]) d.jobs[jobId].refund = refund;
  });
}
