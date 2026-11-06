import { ethers } from "ethers";
import {
  getExpiredActiveKeys,
  markExpiring,
  destroyKey,
  type DestructionReceipt,
} from "./key-store";

export async function runExpiryCheck(): Promise<DestructionReceipt[]> {
  const expired = getExpiredActiveKeys();
  const receipts: DestructionReceipt[] = [];

  for (const entry of expired) {
    markExpiring(entry.keyId);
    const receipt = destroyKey(entry.keyId);
    receipts.push(receipt);
  }

  return receipts;
}

export function signReceipt(receipt: DestructionReceipt): string {
  const oracleKey = process.env.ORACLE_PRIVATE_KEY;
  if (!oracleKey) throw new Error("ORACLE_PRIVATE_KEY not configured");

  const wallet = new ethers.Wallet(oracleKey);
  const payload = JSON.stringify(receipt);
  const hash = ethers.keccak256(ethers.toUtf8Bytes(payload));
  return wallet.signMessageSync(ethers.getBytes(hash));
}
