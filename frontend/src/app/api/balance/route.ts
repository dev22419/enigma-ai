import { NextRequest, NextResponse } from "next/server";
import { getBalance, getQueryPrice } from "@/lib/contract";

export async function GET(req: NextRequest) {
  try {
    const address = req.nextUrl.searchParams.get("address");
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json(
        { error: "Valid wallet address required" },
        { status: 400 }
      );
    }

    const [balance, queryPrice] = await Promise.all([
      getBalance(address),
      getQueryPrice(),
    ]);

    return NextResponse.json({
      address,
      balance,
      queryPrice,
      queriesRemaining: parseFloat(balance) > 0
        ? Math.floor(parseFloat(balance) / parseFloat(queryPrice))
        : 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
