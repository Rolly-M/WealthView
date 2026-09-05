import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateHouseholdId } from "@/lib/supabase/household";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const householdId = await getOrCreateHouseholdId(supabase, user.id);
  if (!householdId) return NextResponse.json([]);

  const { data: sheets, error } = await supabase
    .from("tracking_sheets")
    .select("*, items:tracking_sheet_items(budgeted_amount, actual_amount)")
    .eq("household_id", householdId)
    .order("year", { ascending: false })
    .order("month", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Fold each sheet's line items down to totals here so the list view (used
  // for the sheet picker and month-over-month comparison) doesn't need to
  // fetch every item of every sheet just to show a summary.
  const withTotals = (sheets ?? []).map(({ items, ...sheet }) => {
    const totalBudgeted = (items ?? []).reduce((s: number, i: { budgeted_amount: number }) => s + Number(i.budgeted_amount), 0);
    const totalActual = (items ?? []).reduce((s: number, i: { actual_amount: number }) => s + Number(i.actual_amount), 0);
    return { ...sheet, total_budgeted: totalBudgeted, total_actual: totalActual, item_count: items?.length ?? 0 };
  });

  return NextResponse.json(withTotals);
}

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const householdId = await getOrCreateHouseholdId(supabase, user.id);
  if (!householdId) return NextResponse.json({ error: "No household" }, { status: 404 });

  const body = await req.json();
  const month = Number(body.month);
  const year = Number(body.year);
  if (!month || !year || month < 1 || month > 12) {
    return NextResponse.json({ error: "Valid month and year required" }, { status: 400 });
  }

  const { data: sheet, error } = await supabase
    .from("tracking_sheets")
    .insert({
      household_id: householdId,
      month,
      year,
      name: body.name || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A sheet for this month already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Recurring expenses are, definitionally, the same line items every
  // month — cloning the previous sheet's rows (budgeted carried over,
  // actual reset to 0 for the new month) as a starting point saves
  // re-typing rent/subscriptions/insurance from scratch each time.
  if (body.clone_from_sheet_id) {
    const { data: sourceItems } = await supabase
      .from("tracking_sheet_items")
      .select("category, description, budgeted_amount, notes, sort_order")
      .eq("sheet_id", body.clone_from_sheet_id)
      .order("sort_order", { ascending: true });

    if (sourceItems?.length) {
      await supabase.from("tracking_sheet_items").insert(
        sourceItems.map((item) => ({
          sheet_id: sheet.id,
          category: item.category,
          description: item.description,
          budgeted_amount: item.budgeted_amount,
          actual_amount: 0,
          notes: item.notes,
          sort_order: item.sort_order,
        }))
      );
    }
  }

  return NextResponse.json(sheet, { status: 201 });
}
