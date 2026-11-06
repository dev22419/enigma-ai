// AI-assisted: Used Claude to draft the redaction rules
//
// Nothing that leaves the server in an error, and nothing written to a log, may carry a key,
// a bearer token, or document text. Upstream errors (0G, Arkiv, RPC nodes) can echo request
// bodies, so every message is scrubbed and cut short before it is stored or returned.

const SECRET_ENV_NAMES = ["ZG_API_KEY", "ORACLE_PRIVATE_KEY", "DEPLOYER_PRIVATE_KEY", "ARKIV_ACCESS_KEY"];
const MAX_LENGTH = 300;

function secretValues(): string[] {
  const out: string[] = [];
  for (const name of SECRET_ENV_NAMES) {
    const raw = (process.env[name] ?? "").trim().replace(/^["']|["']$/g, "");
    if (raw.length < 8) continue;
    out.push(raw);
    out.push(raw.replace(/^0x/i, ""));
  }
  return out;
}

export function redact(text: string): string {
  let out = text;
  // Exact configured secrets first, in whatever encoding they were echoed.
  for (const secret of secretValues()) out = out.split(secret).join("[redacted]");
  return out
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(/\b(?:0x)?[0-9a-fA-F]{64}\b/g, "[redacted-hex]") // private keys, key material, hashes
    .replace(/[A-Za-z0-9+/_-]{64,}={0,2}/g, "[redacted-blob]"); // base64 keys, ciphertext, file bodies
}

export function safeErrorMessage(err: unknown, max = MAX_LENGTH): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
  const clean = redact(raw).replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean || "Unknown error";
}
