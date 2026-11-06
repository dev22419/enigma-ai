import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = 1;

export interface EncryptedPayload {
  version: number;
  algorithm: string;
  keyId: string;
  nonce: string;
  ciphertext: string;
  tag: string;
  aad: string;
}

export function generateJobKey(): { keyId: string; keyMaterial: string } {
  const keyId = randomBytes(16).toString("hex");
  const keyMaterial = randomBytes(KEY_BYTES).toString("hex");
  return { keyId, keyMaterial };
}

export function encrypt(
  plaintext: string,
  keyMaterial: string,
  keyId: string,
  aad: string,
): EncryptedPayload {
  const key = Buffer.from(keyMaterial, "hex");
  const nonce = randomBytes(NONCE_BYTES);
  const aadBuf = Buffer.from(aad, "utf-8");

  const cipher = createCipheriv(ALGORITHM, key, nonce, { authTagLength: TAG_BYTES });
  cipher.setAAD(aadBuf);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    version: VERSION,
    algorithm: ALGORITHM,
    keyId,
    nonce: nonce.toString("hex"),
    ciphertext: encrypted.toString("base64"),
    tag: tag.toString("hex"),
    aad,
  };
}

export function decrypt(payload: EncryptedPayload, keyMaterial: string): string {
  if (payload.version !== VERSION) {
    throw new Error(`Unsupported payload version: ${payload.version}`);
  }

  const key = Buffer.from(keyMaterial, "hex");
  const nonce = Buffer.from(payload.nonce, "hex");
  const tag = Buffer.from(payload.tag, "hex");
  const ciphertext = Buffer.from(payload.ciphertext, "base64");
  const aadBuf = Buffer.from(payload.aad, "utf-8");

  const decipher = createDecipheriv(ALGORITHM, key, nonce, { authTagLength: TAG_BYTES });
  decipher.setAuthTag(tag);
  decipher.setAAD(aadBuf);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf-8");
}
