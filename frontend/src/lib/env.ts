// Accepts a private key with or without the 0x prefix; fails with a readable
// message instead of a stack trace from deep inside a crypto library.
export function privateKeyFromEnv(name: string): `0x${string}` {
  const raw = (process.env[name] ?? "").trim().replace(/^["']|["']$/g, "");
  if (!raw) throw new Error(`${name} not configured`);
  const hex = raw.replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`${name} is not a 32-byte hex private key (got ${raw.length} characters)`);
  }
  return `0x${hex}`;
}
