import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateHouseholdId } from "@/lib/supabase/household";

export async function POST(_req: Request, { params }: { params: { ticker: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const householdId = await getOrCreateHouseholdId(supabase, user.id);
  if (!householdId) return NextResponse.json({ error: "No household" }, { status: 404 });

  const { error } = await supabase
    .from("etf_watchlist")
    .upsert({ household_id: householdId, symbol: params.ticker.toUpperCase() }, { onConflict: "household_id,symbol" });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return new NextResponse(null, { status: 204 });
}

export async function DELETE(_req: Request, { params }: { params: { ticker: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const householdId = await getOrCreateHouseholdId(supabase, user.id);
  if (!householdId) return NextResponse.json({ error: "No household" }, { status: 404 });

  const { error } = await supabase
    .from("etf_watchlist")
    .delete()
    .eq("household_id", householdId)
    .eq("symbol", params.ticker.toUpperCase());

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return new NextResponse(null, { status: 204 });
}
