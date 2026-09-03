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
  const allowed = ["name", "total_amount", "period", "month", "year", "rollover", "is_active"];
  const updates = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

  const { data, error } = await supabase
    .from("budgets")
    .update(updates)
    .eq("id", params.id)
    .eq("household_id", householdId)
    .select("*, categories:budget_categories(*)")
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
    .from("budgets")
    .update({ is_active: false })
    .eq("id", params.id)
    .eq("household_id", householdId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return new NextResponse(null, { status: 204 });
}
