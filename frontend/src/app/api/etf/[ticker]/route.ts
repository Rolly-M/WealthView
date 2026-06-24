import { NextResponse } from "next/server";
import { MOCK_ETFS } from "../_data";

export async function GET(_req: Request, { params }: { params: { ticker: string } }) {
  const etf = MOCK_ETFS.find((e) => e.ticker.toUpperCase() === params.ticker.toUpperCase());
  if (!etf) return NextResponse.json({ error: "ETF not found" }, { status: 404 });
  return NextResponse.json(etf);
}
