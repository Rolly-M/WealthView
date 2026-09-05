import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TRACKED_ETF_SYMBOLS, fetchFmpSymbolData } from "@/lib/fmp";

// Daily refresh of real ETF performance data behind Investments → Top
// Picks. Hobby plan caps Vercel Cron at once-per-day — "refreshing
// constantly" in practice means this runs every day and the page always
// reads whatever the latest stored snapshot is, rather than calling FMP
// live on every page view (which would blow through a free-tier rate
// limit fast with multiple viewers).
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.FMP_API_KEY) {
    return NextResponse.json({ error: "FMP_API_KEY is not set" }, { status: 500 });
  }

  const admin = createAdminClient();
  let updated = 0;
  const failures: string[] = [];

  // Sequential, not Promise.all — a free-tier API key's per-second rate
  // limit is easy to trip with ~40 symbols fired at once.
  for (const symbol of TRACKED_ETF_SYMBOLS) {
    const data = await fetchFmpSymbolData(symbol);
    if (!data || data.price === null) {
      failures.push(symbol);
      continue;
    }

    const { error } = await admin.from("etf_market_data").upsert({
      symbol: data.symbol,
      name: data.name,
      price: data.price,
      change_1w_pct: data.change1w,
      change_1m_pct: data.change1m,
      updated_at: new Date().toISOString(),
    });

    if (error) failures.push(symbol);
    else updated++;
  }

  return NextResponse.json({ updated, failures });
}
