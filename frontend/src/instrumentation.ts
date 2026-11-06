export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as unknown as { __enigmaWorker?: boolean };
  if (g.__enigmaWorker) return;
  g.__enigmaWorker = true;
  const { refundFailedJobs } = await import("./lib/refunds");
  const { scrubExpiredJobs } = await import("./lib/scrub");
  const { settleDeliveredJobs } = await import("./lib/settle");
  setInterval(() => {
    refundFailedJobs().catch(() => undefined);
    settleDeliveredJobs().catch(() => undefined);
    scrubExpiredJobs().catch(() => undefined);
  }, 30000);
}
