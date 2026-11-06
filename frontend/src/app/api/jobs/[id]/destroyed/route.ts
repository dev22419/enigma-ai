// AI-assisted: Used Claude to write this file.
import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { markKeyDestroyedOnChain } from "@/lib/contract";
import { tokensEqual } from "@/lib/crypto";
import { readStore, withStore } from "@/lib/store";
import { safeErrorMessage } from "@/lib/redact";
import type { KeyWipeRequest, KeyWipeResponse } from "@/lib/types";

function fail(status: number, error: string) {
  return NextResponse.json({ error: safeErrorMessage(error) }, { status });
}

/** Must match receiptHash() in lib/client/vault.ts: the hash of the receipt's fields, nothing else. */
export function keyWipeReceiptHash(jobId: string, r: KeyWipeRequest): string {
  return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify([jobId, r.keyId, r.expiryTimestamp, r.destructionTimestamp, r.status])));
}

/**
 * Anchors the browser's key-wipe receipt on-chain (task board #75).
 *
 * The browser is the only place the key ever lived, so only the browser can say it was wiped.
 * The contract records that claim as a hash (markKeyDestroyed) and enforces the one thing it can
 * check itself: the job's lifetime has really ended. The receipt holds no key material.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jobId = parseInt(id, 10);
  if (isNaN(jobId) || jobId < 1) return fail(400, "Invalid job ID");

  let body: KeyWipeRequest;
  try {
    body = await req.json();
  } catch {
    return fail(400, "Body must be JSON");
  }
  const now = Math.floor(Date.now() / 1000);
  if (typeof body.keyId !== "string" || !/^[A-Za-z0-9_]{1,40}$/.test(body.keyId)) return fail(400, "keyId is invalid");
  if (!Number.isInteger(body.expiryTimestamp) || body.expiryTimestamp <= 0) return fail(400, "expiryTimestamp must be unix seconds");
  if (!Number.isInteger(body.destructionTimestamp) || body.destructionTimestamp <= 0 || body.destructionTimestamp > now + 60) {
    return fail(400, "destructionTimestamp must be unix seconds and not in the future");
  }
  if (body.status !== "wiped") return fail(400, 'status must be "wiped"');

  const token = req.headers.get("x-access-token") ?? "";
  if (!token) return fail(401, "Missing x-access-token header");
  const row = (await readStore()).jobs[id];
  if (!row) return fail(404, "Job not found in local store");
  if (!row.accessToken || !tokensEqual(token, row.accessToken)) return fail(403, "Invalid access token");
  if (row.status !== "completed") return fail(409, "Only a completed job has a key to destroy");

  const receiptHash = keyWipeReceiptHash(id, body);
  if (row.keyWipe) {
    // Idempotent: a retry gets the first anchoring back, and can't replace it with a different receipt.
    return NextResponse.json({ receiptHash: row.keyWipe.receiptHash, anchorTxHash: row.keyWipe.anchorTxHash } satisfies KeyWipeResponse);
  }

  try {
    const anchorTxHash = await markKeyDestroyedOnChain(jobId, receiptHash);
    await withStore((d) => {
      const r = d.jobs[id];
      if (r) {
        r.keyWipe = { receiptHash, destructionTimestamp: body.destructionTimestamp, anchorTxHash };
        // Nothing left to authorise: the answer is unreadable, so the token and the file name can go.
        r.accessToken = undefined;
        r.fileName = "[removed]";
      }
    });
    return NextResponse.json({ receiptHash, anchorTxHash } satisfies KeyWipeResponse);
  } catch (err) {
    const msg = safeErrorMessage(err);
    return fail(/JobNotExpired/i.test(msg) ? 409 : 502, /JobNotExpired/i.test(msg) ? "The job's lifetime hasn't ended on-chain yet" : msg);
  }
}
