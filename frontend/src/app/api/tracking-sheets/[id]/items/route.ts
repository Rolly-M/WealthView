import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getHouseholdId } from "@/lib/supabase/household";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const householdId = await getHouseholdId(supabase, user.id);
  if (!householdId) return NextResponse.json({ error: "No household" }, { status: 404 });

  // Confirm the sheet is actually this household's before inserting under
  // it — RLS backs this up too, but this gives a clean 404 instead of a
  // generic RLS-denied error.
  const { data: sheet } = await supabase
    .from("tracking_sheets")
    .select("id")
    .eq("id", params.id)
    .eq("household_id", householdId)
    .single();
  if (!sheet) return NextResponse.json({ error: "Sheet not found" }, { status: 404 });

  const body = await req.json();

  const { data: existing } = await supabase
    .from("tracking_sheet_items")
    .select("sort_order")
    .eq("sheet_id", params.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();
  const nextSortOrder = (existing?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("tracking_sheet_items")
    .insert({
      sheet_id: params.id,
      category: body.category ?? "miscellaneous",
      description: body.description ?? "",
      budgeted_amount: body.budgeted_amount ?? 0,
      actual_amount: body.actual_amount ?? 0,
      notes: body.notes ?? null,
      sort_order: nextSortOrder,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
