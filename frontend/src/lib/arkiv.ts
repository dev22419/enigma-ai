import {
  createPublicClient,
  createWalletClient,
  ExpirationTime,
} from "@arkiv-network/sdk";
import { eq } from "@arkiv-network/sdk/query";
import { rabdi } from "@arkiv-network/sdk/chains";
import { bytes, str, defineSchema } from "@arkiv-network/sdk/schema";
import { http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { privateKeyFromEnv } from "./env";

// Arkiv entities are PUBLIC. `data` must only ever hold an AES-GCM envelope.
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
  return createWalletClient({
    chain: getChain(),
    transport: http(),
    account: privateKeyToAccount(privateKeyFromEnv("DEPLOYER_PRIVATE_KEY")),
  });
}

// Arkiv expiries are block heights. Convert one to unix seconds using the
// chain's own clock, so the countdown shows what Arkiv will enforce.
async function blockToUnix(expiresAtBlock: bigint): Promise<number> {
  const t = await getPublicClient().getBlockTiming();
  return Math.floor(t.currentBlockTime + Number(expiresAtBlock - t.currentBlock) * t.blockDuration);
}

export async function storeInArkiv(
  jobId: string,
  envelopeJson: string,
  ttlSeconds: number
): Promise<{ entityKey: string; expiresAtUnix: number; txHash: string }> {
  const client = getWalletClient();
  const { blockDuration } = await getPublicClient().getBlockTiming();
  // fromSeconds only accepts whole numbers of blocks; round up, never down.
  const seconds = Math.ceil(ttlSeconds / blockDuration) * blockDuration;

  const res = await client.createEntity(
    schema,
    { jobId, data: new TextEncoder().encode(envelopeJson) },
    { expiration: ExpirationTime.fromSeconds(seconds) }
  );

  const expiresAtUnix =
    typeof res.expiresAt === "bigint"
      ? await blockToUnix(res.expiresAt)
      : Math.floor(Date.now() / 1000) + seconds;

  return { entityKey: res.entityKey, expiresAtUnix, txHash: res.txHash };
}

export async function fetchFromArkiv(
  jobId: string
): Promise<{ exists: boolean; envelopeJson: string | null; expiresAtUnix: number; entityKey: string | null }> {
  const { entities } = await getPublicClient()
    .select({ $key: true, jobId: true, data: true, $expiresAt: true })
    .from(schema)
    .where(eq("jobId", jobId))
    .fetch();

  const match = entities[0];
  if (!match) return { exists: false, envelopeJson: null, expiresAtUnix: 0, entityKey: null };

  const raw = match.data.value as unknown;
  const envelopeJson =
    raw instanceof Uint8Array
      ? new TextDecoder().decode(raw)
      : Buffer.from(String(raw).replace(/^0x/, ""), "hex").toString("utf-8");

  return {
    exists: true,
    envelopeJson,
    expiresAtUnix: await blockToUnix(BigInt(match.$expiresAt as bigint)),
    entityKey: String(match.$key),
  };
}
