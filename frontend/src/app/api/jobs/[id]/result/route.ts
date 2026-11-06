import { NextRequest, NextResponse } from "next/server";
import { signJobCompletion } from "@/lib/oracle-signer";
import { getJobOnChain, completeJobOnChain } from "@/lib/contract";
import { storeInArkiv } from "@/lib/arkiv";
import { tokensEqual } from "@/lib/crypto";
import { withStore, readStore } from "@/lib/store";
import { safeErrorMessage } from "@/lib/redact";
import type { StoreResultRequest, StoreResultResponse } from "@/lib/types";

const MAX_CIPHERTEXT_CHARS = 12_000_000;

function fail(status: number, error: string) {
  return NextResponse.json({ error: safeErrorMessage(error) }, { status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const jobId = parseInt(id, 10);
  if (isNaN(jobId) || jobId < 1) return fail(400, "Invalid job ID");

  let body: StoreResultRequest;
  try {
    body = await req.json();
  } catch {
    return fail(400, "Body must be JSON");
  }

  if (typeof body.encryptedResult !== "string" || !body.encryptedResult) {
    return fail(400, "encryptedResult is required");
  }
  if (body.encryptedResult.length > MAX_CIPHERTEXT_CHARS) {
    return fail(413, `encryptedResult is too large (limit ${MAX_CIPHERTEXT_CHARS} characters)`);
  }
  if (typeof body.resultHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(body.resultHash)) {
    return fail(400, "resultHash must be a 0x-prefixed keccak256 hash");
  }
  if (typeof body.attestationHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(body.attestationHash)) {
    return fail(400, "attestationHash must be a 0x-prefixed keccak256 hash");
  }
  if (typeof body.chatId !== "string" || !body.chatId) {
    return fail(400, "chatId is required");
  }

  const token = req.headers.get("x-access-token") ?? "";
  if (!token) return fail(401, "Missing x-access-token header");

  const store = await readStore();
  const row = store.jobs[id];
  if (!row) return fail(404, "Job not found in local store");
  if (!row.accessToken || !tokensEqual(token, row.accessToken)) {
    return fail(403, "Invalid access token");
  }
  if (row.status === "completed") return fail(409, "Job already completed");

  try {
    const onChainJob = await getJobOnChain(jobId);
    if (onChainJob.status !== "Pending") {
      return fail(409, `Job is ${onChainJob.status} on-chain, cannot complete`);
    }

    const arkiv = await storeInArkiv(id, body.encryptedResult, onChainJob.expirySeconds);

    const signature = await signJobCompletion({
      jobId: BigInt(jobId),
      user: onChainJob.user,
      fileHash: onChainJob.fileHash,
      resultHash: body.resultHash,
      attestationHash: body.attestationHash,
    });

    const completeTxHash = await completeJobOnChain(
      jobId,
      body.resultHash,
      body.attestationHash,
      signature
    );

    await withStore((d) => {
      if (d.jobs[id]) {
        Object.assign(d.jobs[id], {
          resultHash: body.resultHash,
          attestationHash: body.attestationHash,
          requestId: body.chatId,
          arkivEntityKey: arkiv.entityKey,
          completeTxHash,
          status: "completed",
          expiresAt: arkiv.expiresAtUnix,
        });
      }
    });

    const response: StoreResultResponse = {
      completeTxHash,
      arkivEntityKey: arkiv.entityKey,
      expiresAt: arkiv.expiresAtUnix,
    };
    return NextResponse.json(response);
  } catch (err) {
    await withStore((d) => {
      if (d.jobs[id]) {
        d.jobs[id].status = "failed";
        d.jobs[id].error = safeErrorMessage(err);
      }
    });
    return fail(502, safeErrorMessage(err));
  }
}
