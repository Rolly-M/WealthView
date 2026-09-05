import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getHouseholdId } from "@/lib/supabase/household";

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const householdId = await getHouseholdId(supabase, user.id);
  if (!householdId) return NextResponse.json({ error: "No household" }, { status: 404 });

  const { data: sheet } = await supabase
    .from("tracking_sheets")
    .select("*, items:tracking_sheet_items(*)")
    .eq("id", params.id)
    .eq("household_id", householdId)
    .single();

  if (!sheet) return NextResponse.json({ error: "Sheet not found" }, { status: 404 });

  const items = (sheet.items ?? []).sort(
    (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order
  );

  const rows = [
    ["Category", "Description", "Budgeted", "Actual", "Difference", "Notes"],
    ...items.map((i: { category: string; description: string; budgeted_amount: number; actual_amount: number; notes: string | null }) => [
      i.category,
      i.description,
      Number(i.budgeted_amount).toFixed(2),
      Number(i.actual_amount).toFixed(2),
      (Number(i.budgeted_amount) - Number(i.actual_amount)).toFixed(2),
      i.notes ?? "",
    ]),
  ];

  const totalBudgeted = items.reduce((s: number, i: { budgeted_amount: number }) => s + Number(i.budgeted_amount), 0);
  const totalActual = items.reduce((s: number, i: { actual_amount: number }) => s + Number(i.actual_amount), 0);
  rows.push(["Total", "", totalBudgeted.toFixed(2), totalActual.toFixed(2), (totalBudgeted - totalActual).toFixed(2), ""]);

  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const monthLabel = new Date(sheet.year, sheet.month - 1).toLocaleString("en-US", { month: "long", year: "numeric" });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="tracking-sheet-${monthLabel.replace(" ", "-")}.csv"`,
    },
  });
}
