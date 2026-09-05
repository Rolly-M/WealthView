import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateHouseholdId } from "@/lib/supabase/household";
import { getVisibleAccountIds } from "@/lib/supabase/accounts";

export async function GET(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const householdId = await getOrCreateHouseholdId(supabase, user.id);
  if (!householdId) return NextResponse.json({ total_spent: 0, total_income: 0, savings: 0, savings_rate: 0, by_category: [] });

  const visibleAccountIds = await getVisibleAccountIds(supabase, householdId, user.id);
  if (visibleAccountIds.length === 0) {
    return NextResponse.json({ total_spent: 0, total_income: 0, savings: 0, savings_rate: 0, by_category: [] });
  }

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("start_date") ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const endDate = searchParams.get("end_date") ?? new Date().toISOString().slice(0, 10);

  const { data: txns } = await supabase
    .from("transactions")
    .select("amount, category, is_income")
    .eq("household_id", householdId)
    .in("account_id", visibleAccountIds)
    .eq("is_hidden", false)
    .eq("is_pending", false)
    .gte("date", startDate)
    .lte("date", endDate);

  let totalSpent = 0;
  let totalIncome = 0;
  const categoryTotals: Record<string, { total: number; count: number }> = {};

  for (const t of txns ?? []) {
    const amount = Math.abs(Number(t.amount));
    if (t.is_income) {
      totalIncome += amount;
    } else {
      totalSpent += amount;
      if (!categoryTotals[t.category]) categoryTotals[t.category] = { total: 0, count: 0 };
      categoryTotals[t.category]!.total += amount;
      categoryTotals[t.category]!.count += 1;
    }
  }

  const byCategory = Object.entries(categoryTotals)
    .map(([category, { total, count }]) => ({
      category,
      total,
      count,
      pct_of_total: totalSpent > 0 ? (total / totalSpent) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const savings = totalIncome - totalSpent;
  return NextResponse.json({
    period_start: startDate,
    period_end: endDate,
    total_spent: totalSpent,
    total_income: totalIncome,
    savings,
    savings_rate: totalIncome > 0 ? (savings / totalIncome) * 100 : 0,
    by_category: byCategory,
    transaction_count: txns?.length ?? 0,
  });
}
