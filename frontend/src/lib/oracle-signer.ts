import { ethers } from "ethers";
import { privateKeyFromEnv } from "./env";
import { WHITECHAIN_CHAIN_ID } from "./constants";

const EIP712_DOMAIN = {
  name: "EnigmaAI",
  version: "1",
  chainId: WHITECHAIN_CHAIN_ID,
  verifyingContract: "" as string,
};

const COMPLETE_TYPES = {
  Complete: [
    { name: "jobId", type: "uint256" },
    { name: "user", type: "address" },
    { name: "fileHash", type: "bytes32" },
    { name: "resultHash", type: "bytes32" },
    { name: "attestationHash", type: "bytes32" },
  ],
};

export async function signJobCompletion(params: {
  jobId: bigint;
  user: string;
  fileHash: string;
  resultHash: string;
  attestationHash: string;
}): Promise<string> {
  const oracleKey = privateKeyFromEnv("ORACLE_PRIVATE_KEY");

  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress) throw new Error("CONTRACT_ADDRESS not configured");

  const wallet = new ethers.Wallet(oracleKey);

  const domain = { ...EIP712_DOMAIN, verifyingContract: contractAddress };

  const value = {
    jobId: params.jobId,
    user: params.user,
    fileHash: params.fileHash,
    resultHash: params.resultHash,
    attestationHash: params.attestationHash,
  };

  return wallet.signTypedData(domain, COMPLETE_TYPES, value);
}

export function hashContent(content: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(content));
}
