// Runs the key-expiry worker inside the server process so a key dies within
// seconds of its deadline, not whenever someone next opens the page.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as unknown as { __enigmaWorker?: boolean };
  if (g.__enigmaWorker) return;
  g.__enigmaWorker = true;
  const { destroyExpiredKeys } = await import("./lib/keystore");
  setInterval(() => {
    destroyExpiredKeys().catch(() => undefined);
  }, 3000);
}
