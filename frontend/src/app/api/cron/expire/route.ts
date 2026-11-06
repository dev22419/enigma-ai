import { NextRequest, NextResponse } from "next/server";
import { destroyExpiredKeys } from "@/lib/keystore";
import { refundFailedJobs } from "@/lib/refunds";
import { scrubExpiredJobs } from "@/lib/scrub";
import { settleDeliveredJobs } from "@/lib/settle";
import { tokensEqual } from "@/lib/crypto";

export async function POST(req: NextRequest) {
  // Closed unless a secret is set: an unset secret must never mean "open to everyone".
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not set, so this endpoint is disabled" }, { status: 503 });
  }
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!tokensEqual(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const destroyed = await destroyExpiredKeys();
  const refunded = await refundFailedJobs();
  const settled = await settleDeliveredJobs();
  const scrubbed = await scrubExpiredJobs();
  return NextResponse.json({ destroyed, refunded, settled, scrubbed });
}
