import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateHouseholdId } from "@/lib/supabase/household";
import { MOCK_ETFS } from "../_data";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const householdId = await getOrCreateHouseholdId(supabase, user.id);
  if (!householdId) return NextResponse.json([]);

  const { data: watchlist } = await supabase
    .from("etf_watchlist")
    .select("symbol")
    .eq("household_id", householdId);

  const symbols = (watchlist ?? []).map((w) => w.symbol);
  if (symbols.length === 0) return NextResponse.json([]);

  const { data: marketData } = await supabase
    .from("etf_market_data")
    .select("*")
    .in("symbol", symbols);

  const securities = symbols.map((symbol) => {
    const row = marketData?.find((m) => m.symbol === symbol);
    const mock = MOCK_ETFS.find((m) => m.ticker === symbol);
    return {
      id: symbol.toLowerCase(),
      ticker: symbol,
      name: row?.name ?? mock?.name ?? symbol,
      description: mock?.description,
      exchange: mock?.exchange,
      currency: "USD",
      country: "US",
      issuer: mock?.issuer,
      category: mock?.category,
      focus: mock?.focus,
      tags: mock?.tags ?? [],
      latest_metrics: row
        ? {
            ...(mock?.latest_metrics ?? {}),
            as_of_date: row.updated_at,
            price: row.price ?? mock?.latest_metrics?.price,
            return_1w: row.change_1w_pct ?? undefined,
            return_1m: row.change_1m_pct ?? undefined,
          }
        : mock?.latest_metrics,
    };
  });

  return NextResponse.json(securities);
}
