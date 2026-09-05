import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getHouseholdId } from "@/lib/supabase/household";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const householdId = await getHouseholdId(supabase, user.id);
  if (!householdId) return NextResponse.json({ error: "No household" }, { status: 404 });

  const body = await req.json();
  const allowed = ["name", "current_balance", "available_balance", "is_shared", "include_in_net_worth"];
  const updates = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

  const { data, error } = await supabase
    .from("accounts")
    .update(updates)
    .eq("id", params.id)
    .eq("household_id", householdId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const householdId = await getHouseholdId(supabase, user.id);
  if (!householdId) return NextResponse.json({ error: "No household" }, { status: 404 });

  const { error } = await supabase
    .from("accounts")
    .update({ is_active: false })
    .eq("id", params.id)
    .eq("household_id", householdId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Every transaction-reading endpoint (list, summary, budgets, insights,
  // chat context) already filters on is_hidden — piggyback on that instead
  // of teaching each of them to also check the owning account's is_active,
  // so a disconnected account's history stops appearing everywhere at once
  // instead of lingering as apparent duplicates next to whatever account
  // absorbed it.
  await supabase.from("transactions").update({ is_hidden: true }).eq("account_id", params.id);

  return new NextResponse(null, { status: 204 });
}
