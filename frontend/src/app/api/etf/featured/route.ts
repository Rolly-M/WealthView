import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MOCK_ETFS } from "../_data";

// Real ranking from the daily-refreshed etf_market_data table — previously
// this was just MOCK_ETFS.filter(e => e.latest_metrics?.why_featured),
// i.e. whichever of 5 hardcoded ETFs happened to have that string set, no
// actual performance ranking at all.
export async function GET() {
  const supabase = createClient();

  const [weekRes, monthRes] = await Promise.all([
    supabase.from("etf_market_data").select("*").order("change_1w_pct", { ascending: false, nullsFirst: false }).limit(5),
    supabase.from("etf_market_data").select("*").order("change_1m_pct", { ascending: false, nullsFirst: false }).limit(10),
  ]);

  const toSecurity = (row: { symbol: string; name: string | null; price: number | null; change_1w_pct: number | null; change_1m_pct: number | null; updated_at: string }) => {
    // Blend in richer profile data (expense ratio, holdings, sector
    // breakdown) for the handful of tickers that still have it from the
    // original mock set — real for everything else, but without that
    // deeper fundamental data yet.
    const mock = MOCK_ETFS.find((m) => m.ticker === row.symbol);
    return {
      id: row.symbol.toLowerCase(),
      ticker: row.symbol,
      name: row.name ?? mock?.name ?? row.symbol,
      description: mock?.description,
      exchange: mock?.exchange,
      currency: "USD",
      country: "US",
      issuer: mock?.issuer,
      category: mock?.category,
      focus: mock?.focus,
      tags: mock?.tags ?? [],
      latest_metrics: {
        ...(mock?.latest_metrics ?? {}),
        as_of_date: row.updated_at,
        price: row.price ?? mock?.latest_metrics?.price,
        return_1w: row.change_1w_pct ?? undefined,
        return_1m: row.change_1m_pct ?? undefined,
      },
    };
  };

  return NextResponse.json({
    top_week: (weekRes.data ?? []).filter((r) => r.change_1w_pct !== null).map(toSecurity),
    top_month: (monthRes.data ?? []).filter((r) => r.change_1m_pct !== null).map(toSecurity),
  });
}
