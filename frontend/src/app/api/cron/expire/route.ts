import { NextResponse } from "next/server";
import { refundFailedJobs } from "@/lib/refunds";

export async function POST() {
  const refunded = await refundFailedJobs();
  return NextResponse.json({ refunded });
}
