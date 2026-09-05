import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getHouseholdId } from "@/lib/supabase/household";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string; itemId: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const householdId = await getHouseholdId(supabase, user.id);
  if (!householdId) return NextResponse.json({ error: "No household" }, { status: 404 });

  const { data: sheet } = await supabase
    .from("tracking_sheets")
    .select("id")
    .eq("id", params.id)
    .eq("household_id", householdId)
    .single();
  if (!sheet) return NextResponse.json({ error: "Sheet not found" }, { status: 404 });

  const body = await req.json();
  const allowed = ["category", "description", "budgeted_amount", "actual_amount", "notes", "sort_order"];
  const updates = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("tracking_sheet_items")
    .update(updates)
    .eq("id", params.itemId)
    .eq("sheet_id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; itemId: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const householdId = await getHouseholdId(supabase, user.id);
  if (!householdId) return NextResponse.json({ error: "No household" }, { status: 404 });

  const { data: sheet } = await supabase
    .from("tracking_sheets")
    .select("id")
    .eq("id", params.id)
    .eq("household_id", householdId)
    .single();
  if (!sheet) return NextResponse.json({ error: "Sheet not found" }, { status: 404 });

  const { error } = await supabase
    .from("tracking_sheet_items")
    .delete()
    .eq("id", params.itemId)
    .eq("sheet_id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return new NextResponse(null, { status: 204 });
}
