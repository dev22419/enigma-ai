import { NextRequest, NextResponse } from "next/server";
import { destroyExpiredKeys } from "@/lib/keystore";
import { refundFailedJobs } from "@/lib/refunds";

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const destroyed = await destroyExpiredKeys();
  const refunded = await refundFailedJobs();
  return NextResponse.json({ destroyed, refunded });
}
