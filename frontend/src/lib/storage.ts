// AI-assisted: Used Claude to draft the 0G Storage upload against the SDK's documented API
import { ethers } from "ethers";
import { privateKeyFromEnv } from "./env";
import { safeErrorMessage } from "./redact";

export interface StoredBlob {
  rootHash: string;
  txHash: string;
}

const DEFAULT_EVM_RPC = "https://evmrpc-testnet.0g.ai";

// Upload is opt-in: it runs when ZG_STORAGE_INDEXER is set (e.g. https://indexer-storage-testnet-turbo.0g.ai).
// It needs a 0G testnet wallet with gas; the deployer key is used.
export function storageConfigured(): boolean {
  return !!process.env.ZG_STORAGE_INDEXER?.trim();
}

// Only ever called with an AES-GCM envelope. 0G Storage is persistent and public by hash, so the
// ciphertext stays after the key is destroyed; that is exactly the "decryption fails" demo.
export async function uploadCiphertext(envelopeJson: string): Promise<StoredBlob> {
  const indexerUrl = process.env.ZG_STORAGE_INDEXER?.trim();
  if (!indexerUrl) throw new Error("ZG_STORAGE_INDEXER not configured");
  const evmRpc = process.env.ZG_RPC?.trim() || DEFAULT_EVM_RPC;

  // Loaded on demand: the SDK is heavy and only the upload path needs it.
  const { Indexer, MemData } = await import("@0gfoundation/0g-ts-sdk");
  const signer = new ethers.Wallet(privateKeyFromEnv("DEPLOYER_PRIVATE_KEY"), new ethers.JsonRpcProvider(evmRpc));

  let result: Awaited<ReturnType<InstanceType<typeof Indexer>["upload"]>>;
  try {
    result = await new Indexer(indexerUrl).upload(new MemData(Buffer.from(envelopeJson, "utf8")), evmRpc, signer);
  } catch (err) {
    throw new Error(`0G Storage upload failed: ${safeErrorMessage(err)}`);
  }
  const [res, err] = result;
  if (err) throw new Error(`0G Storage upload failed: ${safeErrorMessage(err)}`);
  if (!("rootHash" in res)) throw new Error("0G Storage upload returned a split upload; unexpected for one small envelope");
  return { rootHash: res.rootHash, txHash: res.txHash };
}
