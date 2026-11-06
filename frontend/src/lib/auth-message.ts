// AI-assisted: Used Claude to write this file.
//
// The text a wallet signs to let Enigma spend from its owner's prepaid balance for ONE job.
// Shared by the browser (which asks the wallet to sign it) and the server (which rebuilds it
// from the request and checks the signature), so the two can never drift apart.
//
// It is bound to the document (file hash), the lifespan, the price, the contract and chain,
// a short validity window and a one-time nonce, so a signature can't be reused for anything else.

export interface JobAuthFields {
  userAddress: string;
  fileHash: string;
  ttl: number;
  /** Query price in USDT as the contract reports it, e.g. "0.5". */
  price: string;
  /** Unix seconds. The server rejects a signature past this, or further than 10 minutes ahead. */
  validUntil: number;
  /** 16 random bytes, 0x-prefixed hex. Each nonce works once. */
  nonce: string;
  contract: string;
  chainId: number;
}

export const AUTH_MAX_WINDOW_SECONDS = 600;

export function buildAuthMessage(f: JobAuthFields): string {
  return [
    "Enigma job authorization",
    "",
    `Spend ${f.price} USDT from my Enigma balance for one private job.`,
    `Wallet: ${f.userAddress.toLowerCase()}`,
    `File hash: ${f.fileHash.toLowerCase()}`,
    `Answer lifespan: ${f.ttl} seconds`,
    `Valid until: ${new Date(f.validUntil * 1000).toISOString()} (${f.validUntil})`,
    `Nonce: ${f.nonce.toLowerCase()}`,
    `Contract: ${f.contract.toLowerCase()} on chain ${f.chainId}`,
  ].join("\n");
}
