// Runs background workers inside the server process:
//  - key expiry, every 3s, so a key dies within seconds of its deadline, not whenever someone next opens the page
//  - refunds for failed jobs, every 30s, once their on-chain deadline has passed
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as unknown as { __enigmaWorker?: boolean };
  if (g.__enigmaWorker) return;
  g.__enigmaWorker = true;
  const { destroyExpiredKeys } = await import("./lib/keystore");
  const { refundFailedJobs } = await import("./lib/refunds");
  setInterval(() => {
    destroyExpiredKeys().catch(() => undefined);
  }, 3000);
  setInterval(() => {
    refundFailedJobs().catch(() => undefined);
  }, 30000);
}
