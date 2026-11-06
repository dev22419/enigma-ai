import { NextResponse } from "next/server";
import { destroyExpiredKeys } from "@/lib/keystore";

// Manual trigger for the expiry worker (it also runs on a 3s timer in the server).
export async function POST() {
  const destroyed = await destroyExpiredKeys();
  return NextResponse.json({ destroyed });
}
