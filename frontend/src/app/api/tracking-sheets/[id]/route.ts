import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getHouseholdId } from "@/lib/supabase/household";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const householdId = await getHouseholdId(supabase, user.id);
  if (!householdId) return NextResponse.json({ error: "No household" }, { status: 404 });

  const { data: sheet, error } = await supabase
    .from("tracking_sheets")
    .select("*, items:tracking_sheet_items(*)")
    .eq("id", params.id)
    .eq("household_id", householdId)
    .single();

  if (error || !sheet) return NextResponse.json({ error: "Sheet not found" }, { status: 404 });

  sheet.items = (sheet.items ?? []).sort(
    (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order
  );

  return NextResponse.json(sheet);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const householdId = await getHouseholdId(supabase, user.id);
  if (!householdId) return NextResponse.json({ error: "No household" }, { status: 404 });

  const body = await req.json();
  const allowed = ["name"];
  const updates = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

  const { data, error } = await supabase
    .from("tracking_sheets")
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
    .from("tracking_sheets")
    .delete()
    .eq("id", params.id)
    .eq("household_id", householdId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return new NextResponse(null, { status: 204 });
}
