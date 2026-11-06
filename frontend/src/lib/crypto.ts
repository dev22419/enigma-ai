import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type ObjectType = "input" | "result";

export interface Envelope {
  version: 1;
  algorithm: "AES-256-GCM";
  keyId: string;
  nonce: string;
  ciphertext: string;
  tag: string;
  aad: { jobId: string; objectType: ObjectType };
}

export function newJobKey(): Buffer {
  return randomBytes(32);
}

export function newKeyId(): string {
  return `key-${randomBytes(8).toString("hex")}`;
}

// The AAD binds a ciphertext to its key, job and object type, so a blob
// cannot be swapped between jobs or passed off as the other object type.
function aadBytes(keyId: string, jobId: string, objectType: ObjectType): Buffer {
  return Buffer.from(`enigma-ai:v1:${keyId}:${jobId}:${objectType}`, "utf8");
}

export function encrypt(
  key: Buffer,
  keyId: string,
  plaintext: string | Buffer,
  aad: { jobId: string; objectType: ObjectType }
): Envelope {
  // A fresh 12-byte nonce for every call. Never reuse one under the same key.
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(aadBytes(keyId, aad.jobId, aad.objectType));
  const data = typeof plaintext === "string" ? Buffer.from(plaintext, "utf8") : plaintext;
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  return {
    version: 1,
    algorithm: "AES-256-GCM",
    keyId,
    nonce: nonce.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    aad: { jobId: aad.jobId, objectType: aad.objectType },
  };
}

export function decrypt(
  key: Buffer,
  envelope: Envelope,
  expected: { jobId: string; objectType: ObjectType }
): Buffer {
  if (envelope.version !== 1 || envelope.algorithm !== "AES-256-GCM") {
    throw new Error("Unsupported envelope");
  }
  if (envelope.aad.jobId !== expected.jobId || envelope.aad.objectType !== expected.objectType) {
    throw new Error("Envelope does not belong to this job/object");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.nonce, "base64"));
  decipher.setAAD(aadBytes(envelope.keyId, envelope.aad.jobId, envelope.aad.objectType));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]);
}

export function serializeEnvelope(env: Envelope): string {
  return JSON.stringify(env);
}

export function parseEnvelope(raw: string): Envelope {
  return JSON.parse(raw) as Envelope;
}
