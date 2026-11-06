import { NextResponse } from "next/server";
import { runExpiryCheck } from "@/lib/expiry-worker";
import { signReceipt } from "@/lib/expiry-worker";

export async function POST() {
  try {
    const receipts = await runExpiryCheck();
    const signed = receipts.map((r) => ({
      ...r,
      signature: signReceipt(r),
    }));

    return NextResponse.json({
      destroyed: signed.length,
      receipts: signed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
