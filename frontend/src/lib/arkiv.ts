import { ethers } from "ethers";
import { ARKIV_RPC } from "./constants";

const ARKIV_ENTITY_ABI = [
  "function createEntity(bytes32 entityId, bytes data, uint256 ttl) external",
  "function getEntity(bytes32 entityId) external view returns (bytes data, uint256 expiresAt, bool exists)",
  "function deleteEntity(bytes32 entityId) external",
];

const ARKIV_CONTRACT = process.env.ARKIV_CONTRACT_ADDRESS || "";

function getArkivProvider() {
  return new ethers.JsonRpcProvider(ARKIV_RPC);
}

function getArkivSigner() {
  const key = process.env.ORACLE_PRIVATE_KEY;
  if (!key) throw new Error("ORACLE_PRIVATE_KEY not configured");
  return new ethers.Wallet(key, getArkivProvider());
}

function getArkivContract(signerOrProvider: ethers.Signer | ethers.Provider) {
  if (!ARKIV_CONTRACT) throw new Error("ARKIV_CONTRACT_ADDRESS not configured");
  return new ethers.Contract(ARKIV_CONTRACT, ARKIV_ENTITY_ABI, signerOrProvider);
}

export async function storeInArkiv(
  jobId: string,
  data: string,
  ttlSeconds: number
): Promise<string> {
  const signer = getArkivSigner();
  const contract = getArkivContract(signer);
  const entityId = ethers.keccak256(ethers.toUtf8Bytes(jobId));
  const encodedData = ethers.toUtf8Bytes(data);

  const tx = await contract.createEntity(entityId, encodedData, ttlSeconds);
  await tx.wait();

  return entityId;
}

export async function fetchFromArkiv(
  jobId: string
): Promise<{ data: string; expiresAt: number; exists: boolean }> {
  const provider = getArkivProvider();
  const contract = getArkivContract(provider);
  const entityId = ethers.keccak256(ethers.toUtf8Bytes(jobId));

  const [rawData, expiresAt, exists] = await contract.getEntity(entityId);

  return {
    data: exists ? ethers.toUtf8String(rawData) : "",
    expiresAt: Number(expiresAt),
    exists,
  };
}
