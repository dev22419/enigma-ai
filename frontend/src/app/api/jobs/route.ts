import { NextRequest, NextResponse } from "next/server";
import { TASK_TYPES } from "@/lib/constants";
import { runInference, getTeeAttestation } from "@/lib/og-inference";
import { signJobCompletion, hashContent } from "@/lib/oracle-signer";
import { createJobOnChain, completeJobOnChain, getJobOnChain } from "@/lib/contract";
import { storeInArkiv } from "@/lib/arkiv";
import { generateJobKey, encrypt } from "@/lib/crypto";
import { createKey, activateKey } from "@/lib/key-store";
import { runExpiryCheck } from "@/lib/expiry-worker";
import type { CreateJobRequest, CreateJobResponse } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body: CreateJobRequest = await req.json();

    if (!TASK_TYPES.includes(body.taskType)) {
      return NextResponse.json(
        { error: `Invalid taskType. Must be one of: ${TASK_TYPES.join(", ")}` },
        { status: 400 },
      );
    }

    if (!body.fileContent || !body.fileName) {
      return NextResponse.json(
        { error: "fileContent and fileName are required" },
        { status: 400 },
      );
    }

    if (!body.ttl || body.ttl < 60 || body.ttl > 86400) {
      return NextResponse.json(
        { error: "ttl must be between 60 and 86400 seconds" },
        { status: 400 },
      );
    }

    const fileHash = hashContent(body.fileContent);

    // 1. Generate per-job encryption key
    const { keyId, keyMaterial } = generateJobKey();

    // 2. Create job on-chain (locks payment from balance)
    const { jobId, txHash: createTxHash } = await createJobOnChain(fileHash, body.ttl);

    // Store key with job binding
    createKey(keyId, String(jobId), keyMaterial, body.ttl);

    // 3. Run 0G inference inside TEE
    const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(body.fileName);
    const { chatId, content, provider, requestId } = await runInference(
      body.taskType,
      body.fileContent,
      isImage ? body.fileContent : undefined,
    );

    // Key is now active (inference succeeded)
    activateKey(keyId);

    const resultHash = hashContent(content);

    // 4. Build TEE attestation from 0G trace data
    const attestation = await getTeeAttestation(chatId, provider, requestId);
    const attestationHash = hashContent(attestation);

    // 5. Read on-chain job to get user + fileHash for signing
    const onChainJob = await getJobOnChain(jobId);

    // 6. Oracle signs the completion (EIP-712)
    const signature = await signJobCompletion({
      jobId: BigInt(jobId),
      user: onChainJob.user,
      fileHash: onChainJob.fileHash,
      resultHash,
      attestationHash,
    });

    // 7. Complete job on-chain (releases payment to provider)
    const completeTxHash = await completeJobOnChain(
      jobId,
      resultHash,
      attestationHash,
      signature,
    );

    // 8. Encrypt result and store ciphertext in Arkiv
    const aad = JSON.stringify({ jobId: String(jobId), objectType: "result" });
    const encryptedResult = encrypt(content, keyMaterial, keyId, aad);
    let arkivKey: string | null = null;
    try {
      arkivKey = await storeInArkiv(
        `job-${jobId}`,
        JSON.stringify(encryptedResult),
        body.ttl,
      );
    } catch {
      // Arkiv storage is best-effort — job is already completed on-chain
    }

    // 9. Fire-and-forget expiry check for any past jobs
    runExpiryCheck().catch(() => {});

    const now = Math.floor(Date.now() / 1000);

    const response: CreateJobResponse = {
      jobId: String(jobId),
      status: "completed",
      result: content,
      txHash: completeTxHash,
      attestationHash,
      expiresAt: now + body.ttl,
    };

    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
