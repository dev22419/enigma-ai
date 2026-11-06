import { NextResponse } from "next/server";
import { destroyExpiredKeys } from "@/lib/keystore";
import { refundFailedJobs } from "@/lib/refunds";

export async function POST() {
  const destroyed = await destroyExpiredKeys();
  const refunded = await refundFailedJobs();
  return NextResponse.json({ destroyed, refunded });
}
