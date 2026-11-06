// AI-assisted: Used Claude to write this file.
import { completeJobOnChain, getJobOnChain, startProcessingOnChain } from "./contract";
import { signJobCompletion } from "./oracle-signer";
import { readStore, withStore } from "./store";

const g = globalThis as unknown as { __enigmaSettling?: boolean };

// How long a delivered answer may sit unstored before the server completes the job itself.
// Well inside the contract's job timeout, so the payment is taken while the job can still be completed.
export const SETTLE_AFTER_SECONDS = 600;

/**
 * A job whose answer was delivered (/api/infer succeeded) but never stored must not be refundable:
 * the user already has the answer. After a short wait the server completes it on-chain from the hashes it
 * recorded itself, so the payment goes to the provider. Nothing is stored on Arkiv, so there is no ciphertext
 * to expire. Safe to run repeatedly.
 */
export async function settleDeliveredJobs(now = Math.floor(Date.now() / 1000)): Promise<string[]> {
  if (g.__enigmaSettling) return [];
  g.__enigmaSettling = true;
  const settled: string[] = [];
  try {
    const { jobs } = await readStore();
    const due = Object.values(jobs).filter((j) => j.status === "processing" && j.inferred && !j.completeTxHash && now - j.inferred.at >= SETTLE_AFTER_SECONDS);
    for (const j of due) {
      try {
        const chain = await getJobOnChain(Number(j.jobId));
        // Only while the contract still accepts a completion. Past the deadline it is out of the server's hands.
        if ((chain.status !== "Pending" && chain.status !== "Processing") || now > chain.deadline) continue;
        if (chain.status === "Pending") await startProcessingOnChain(Number(j.jobId)).catch(() => undefined);
        const { resultHash, attestationHash, chatId } = j.inferred!;
        const signature = await signJobCompletion({ jobId: BigInt(j.jobId), user: chain.user, fileHash: chain.fileHash, resultHash, attestationHash });
        const completeTxHash = await completeJobOnChain(Number(j.jobId), resultHash, attestationHash, signature);
        await withStore((d) => {
          const r = d.jobs[j.jobId];
          if (!r) return;
          Object.assign(r, {
            resultHash,
            attestationHash,
            requestId: chatId,
            completeTxHash,
            status: "completed",
            expiresAt: now + chain.expirySeconds,
            error: "The answer was delivered but never stored, so the server completed the job.",
          });
        });
        settled.push(j.jobId);
      } catch {
        // leave it for the next pass
      }
    }
  } finally {
    g.__enigmaSettling = false;
  }
  return settled;
}
