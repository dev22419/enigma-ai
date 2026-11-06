import {
  createPublicClient,
  createWalletClient,
  ExpirationTime,
} from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { bytes, str, defineSchema } from "@arkiv-network/sdk/schema";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

const schema = defineSchema("enigma-ai.results", {
  jobId: str().indexed(),
  data: bytes(),
});

function getChain() {
  const accessKey = process.env.ARKIV_ACCESS_KEY ?? "";
  return rabdi({ accessKey });
}

function getPublicClient() {
  return createPublicClient({ chain: getChain(), transport: http() });
}

function getWalletClient() {
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) throw new Error("DEPLOYER_PRIVATE_KEY not configured");
  const account = privateKeyToAccount(key as Hex);
  return createWalletClient({
    chain: getChain(),
    transport: http(),
    account,
  });
}

function ttlToExpiration(ttlSeconds: number) {
  const days = Math.ceil(ttlSeconds / 86400);
  if (days >= 1) return ExpirationTime.fromDays(days);
  const minutes = Math.ceil(ttlSeconds / 60);
  return ExpirationTime.fromMinutes(minutes);
}

export async function storeInArkiv(
  jobId: string,
  data: string,
  ttlSeconds: number
): Promise<string> {
  const client = getWalletClient();
  const encoded = new TextEncoder().encode(data);

  const { entityKey, expiresAt } = await client.createEntity(
    schema,
    {
      jobId,
      data: encoded,
    },
    { expiration: ttlToExpiration(ttlSeconds) }
  );

  return entityKey;
}

export async function fetchFromArkiv(
  jobId: string
): Promise<{ data: string; expiresAt: number; exists: boolean }> {
  const client = getPublicClient();
  const account = getWalletClient().account;

  const { entities } = await client
    .select({ jobId: true, data: true, $expiresAt: true })
    .from(schema)
    .ownedBy(account.address)
    .fetch();

  const match = entities.find((e) => e.jobId.value === jobId);

  if (!match) {
    return { data: "", expiresAt: 0, exists: false };
  }

  const hex = match.data.value.startsWith("0x")
    ? match.data.value.slice(2)
    : match.data.value;
  const decoded = Buffer.from(hex, "hex").toString("utf-8");

  return {
    data: decoded,
    expiresAt: Number(match.$expiresAt),
    exists: true,
  };
}
