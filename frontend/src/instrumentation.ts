export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as unknown as { __enigmaWorker?: boolean };
  if (g.__enigmaWorker) return;
  g.__enigmaWorker = true;
  const { refundFailedJobs } = await import("./lib/refunds");
  setInterval(() => {
    refundFailedJobs().catch(() => undefined);
  }, 30000);
}
