// AI-assisted: Used Claude to write this file.
import { withStore } from "./store";

// After a job's lifetime ends, the server keeps only what is public on-chain anyway (hashes, tx hashes,
// timestamps). The access token and the file name go. The grace period lets a browser that was closed
// at expiry still come back and anchor its key-wipe receipt, which needs the token.
export const SCRUB_GRACE_SECONDS = 3600;

export async function scrubExpiredJobs(now = Math.floor(Date.now() / 1000)): Promise<string[]> {
  return withStore((d) => {
    const scrubbed: string[] = [];
    for (const r of Object.values(d.jobs)) {
      if (!r.expiresAt || now < r.expiresAt + SCRUB_GRACE_SECONDS) continue;
      if (!r.accessToken && r.fileName === "[removed]") continue;
      r.accessToken = undefined;
      r.fileName = "[removed]";
      scrubbed.push(r.jobId);
    }
    return scrubbed;
  });
}
