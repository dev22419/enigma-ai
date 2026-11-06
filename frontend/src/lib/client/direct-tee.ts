// AI-assisted: Used Claude to write this file.
// Direct browser→TEE inference via 0G Compute SDK.
// The plaintext never leaves the browser except into the TEE provider's sealed enclave.
// No backend, no router in the plaintext path.
"use client";

import {
  createZGComputeNetworkBroker,
  type ZGComputeNetworkBroker,
} from "@0gfoundation/0g-compute-ts-sdk";
import { JsonRpcProvider, Wallet } from "ethers";
import { SYSTEM_PROMPT } from "../constants";

const ZG_RPC = "https://evmrpc-testnet.0g.ai";
const ZG_CHAIN_ID = 16602;

const MIN_LEDGER_DEPOSIT = 0.05;
const MIN_PROVIDER_TRANSFER = BigInt(500_000_000_000_000); // 0.0005 0G

export interface DirectInferenceResult {
  content: string;
  chatId: string;
  provider: string;
  model: string;
  finishReason: string;
}

let _broker: ZGComputeNetworkBroker | null = null;

/**
 * Get or create the 0G Compute broker using a dedicated 0G testnet key.
 * The user's wallet stays on Whitechain for Enigma payments; this separate
 * signer handles 0G Compute settlement on chain 16602.
 */
export async function getBroker(): Promise<ZGComputeNetworkBroker> {
  if (_broker) return _broker;

  const pk = process.env.NEXT_PUBLIC_ZG_COMPUTE_KEY;
  if (!pk) throw new Error("NEXT_PUBLIC_ZG_COMPUTE_KEY not set — direct TEE mode unavailable");

  const provider = new JsonRpcProvider(ZG_RPC, ZG_CHAIN_ID);
  const signer = new Wallet(pk, provider);
  _broker = await createZGComputeNetworkBroker(signer);
  return _broker;
}

export interface TeeProvider {
  address: string;
  endpoint: string;
  model: string;
  url: string;
}

/**
 * Discover TeeML providers from the 0G Compute contract.
 * Filters to only providers with TEE verification.
 */
export async function discoverTeeProviders(
  broker: ZGComputeNetworkBroker
): Promise<TeeProvider[]> {
  const services = await broker.inference.listService();
  const teeServices = services.filter(
    (s) => s.verifiability === "TeeML" || s.serviceType === "TeeML"
  );

  const providers: TeeProvider[] = [];
  for (const svc of teeServices) {
    try {
      const providerAddr =
        typeof svc.provider === "string" ? svc.provider : String(svc[0]);
      const meta = await broker.inference.getServiceMetadata(providerAddr);
      providers.push({
        address: providerAddr,
        endpoint: meta.endpoint,
        model: meta.model,
        url: svc.url || meta.endpoint,
      });
    } catch {
      // Skip providers that fail metadata lookup
    }
  }
  return providers;
}

/**
 * Ensure the wallet has enough balance and has acknowledged the provider.
 * This handles the 0G Compute settlement flow:
 * 1. Check/create ledger
 * 2. Deposit to ledger if needed
 * 3. Transfer to provider sub-account if needed
 * 4. Acknowledge provider signer if needed
 */
export async function ensureProviderReady(
  broker: ZGComputeNetworkBroker,
  providerAddress: string
): Promise<void> {
  // Check if provider signer is acknowledged
  const acked = await broker.inference.acknowledged(providerAddress);
  if (!acked) {
    await broker.inference.acknowledgeProviderSigner(providerAddress);
  }

  // Check account balance for this provider
  try {
    const account = await broker.inference.getAccount(providerAddress);
    const balance = account.balance ?? BigInt(0);
    if (balance < MIN_PROVIDER_TRANSFER) {
      // Need to fund — first check ledger balance
      try {
        const ledger = await broker.ledger.getLedger();
        const ledgerBalance = ledger.availableBalance ?? BigInt(0);
        if (ledgerBalance < MIN_PROVIDER_TRANSFER * BigInt(2)) {
          await broker.ledger.depositFund(MIN_LEDGER_DEPOSIT);
        }
      } catch {
        // Ledger doesn't exist yet — create it with initial deposit
        await broker.ledger.addLedger(MIN_LEDGER_DEPOSIT);
      }
      // Transfer to provider sub-account
      await broker.ledger.transferFund(
        providerAddress,
        "inference",
        MIN_PROVIDER_TRANSFER
      );
    }
  } catch {
    // Account doesn't exist — needs ledger + transfer
    try {
      await broker.ledger.getLedger();
    } catch {
      await broker.ledger.addLedger(MIN_LEDGER_DEPOSIT);
    }
    await broker.ledger.transferFund(
      providerAddress,
      "inference",
      MIN_PROVIDER_TRANSFER
    );
  }
}

const MAX_OUTPUT_TOKENS = 8192;

/**
 * Run inference directly against a TeeML provider, bypassing the backend
 * and 0G router entirely. The plaintext goes only: browser → TEE enclave.
 *
 * System prompt wrapping happens here in the browser, so the backend
 * never sees the document content.
 */
export async function runDirectInference(
  broker: ZGComputeNetworkBroker,
  provider: TeeProvider,
  content: string,
  imageBase64?: string,
  mimeType = "image/png"
): Promise<DirectInferenceResult> {
  const messages: Array<{
    role: string;
    content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  }> = [{ role: "system", content: SYSTEM_PROMPT }];

  if (imageBase64) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: "Analyze this document:" },
        {
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${imageBase64}` },
        },
      ],
    });
  } else {
    messages.push({
      role: "user",
      content: `Analyze the following document:\n\n${content}`,
    });
  }

  const body = JSON.stringify({
    model: provider.model,
    messages,
    max_tokens: MAX_OUTPUT_TOKENS,
    verify_tee: true,
  });

  // Get auth headers for this provider (handles billing/settlement)
  const headers = await broker.inference.getRequestHeaders(provider.address);

  const res = await fetch(`${provider.endpoint}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Direct TEE inference failed: ${res.status} ${text}`);
  }

  const data = await res.json();

  // Process the response for billing
  const chatId = res.headers.get("ZG-Res-Key") || data.id || "";
  const usage = data.usage
    ? JSON.stringify(data.usage)
    : "";
  await broker.inference
    .processResponse(provider.address, chatId, usage)
    .catch(() => {});

  return {
    content: data.choices?.[0]?.message?.content || "",
    chatId: data.id || chatId,
    provider: provider.address,
    model: provider.model,
    finishReason: data.choices?.[0]?.finish_reason || "",
  };
}

/**
 * Check if direct TEE mode can be set up (key configured + providers exist).
 */
export async function checkDirectTeeAvailable(): Promise<{
  available: boolean;
  reason?: string;
}> {
  try {
    if (!process.env.NEXT_PUBLIC_ZG_COMPUTE_KEY) {
      return { available: false, reason: "NEXT_PUBLIC_ZG_COMPUTE_KEY not set" };
    }
    const broker = await getBroker();
    const providers = await discoverTeeProviders(broker);
    if (providers.length === 0) {
      return { available: false, reason: "No TeeML providers available on 0G Compute" };
    }
    return { available: true };
  } catch (e) {
    return { available: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

export { ZG_CHAIN_ID, ZG_RPC };
