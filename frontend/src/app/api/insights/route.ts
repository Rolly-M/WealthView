import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Rule-based insight generation from transaction data
export async function GET(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .single();
  if (!membership) return NextResponse.json([]);

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}-01`;
  const lastMonthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const [thisMonthTxns, lastMonthTxns, budgets, goals] = await Promise.all([
    supabase.from("transactions").select("amount, category, is_income").eq("household_id", membership.household_id).gte("date", thisMonth).eq("is_hidden", false),
    supabase.from("transactions").select("amount, category, is_income").eq("household_id", membership.household_id).gte("date", lastMonth).lt("date", lastMonthEnd).eq("is_hidden", false),
    supabase.from("budgets").select("*, budget_categories(*)").eq("household_id", membership.household_id).eq("is_active", true),
    supabase.from("goals").select("*").eq("household_id", membership.household_id).eq("status", "active"),
  ]);

  const insights: Array<{
    id: string; type: string; title: string; body: string;
    severity: string; category?: string; amount?: number; pct_change?: number;
    is_read: boolean; is_dismissed: boolean; is_saved: boolean;
    metadata_: Record<string, unknown>; created_at: string;
  }> = [];

  // Spending by category this month
  const thisSpend: Record<string, number> = {};
  const lastSpend: Record<string, number> = {};
  let thisTotal = 0;
  let thisIncome = 0;

  for (const t of thisMonthTxns.data ?? []) {
    const a = Math.abs(Number(t.amount));
    if (t.is_income) { thisIncome += a; continue; }
    thisTotal += a;
    thisSpend[t.category] = (thisSpend[t.category] ?? 0) + a;
  }
  for (const t of lastMonthTxns.data ?? []) {
    if (t.is_income) continue;
    lastSpend[t.category] = (lastSpend[t.category] ?? 0) + Math.abs(Number(t.amount));
  }

  // Category spike vs last month
  for (const [cat, amount] of Object.entries(thisSpend)) {
    const prev = lastSpend[cat] ?? 0;
    if (prev > 0) {
      const pct = ((amount - prev) / prev) * 100;
      if (pct > 30 && amount > 50) {
        insights.push({
          id: `spike-${cat}`,
          type: "category_spike",
          title: `${cap(cat)} spending is up ${Math.round(pct)}%`,
          body: `You've spent $${amount.toFixed(2)} on ${cat} this month vs $${prev.toFixed(2)} last month.`,
          severity: pct > 50 ? "warning" : "info",
          category: cat,
          amount,
          pct_change: pct,
          is_read: false, is_dismissed: false, is_saved: false,
          metadata_: {}, created_at: now.toISOString(),
        });
      }
    }
  }

  // Budget overrun check
  for (const budget of budgets.data ?? []) {
    const totalBudget = Number(budget.total_amount);
    if (totalBudget > 0 && thisTotal > totalBudget) {
      insights.push({
        id: `budget-over-${budget.id}`,
        type: "budget_exceeded",
        title: `"${budget.name}" budget exceeded`,
        body: `You've spent $${thisTotal.toFixed(2)} against a $${totalBudget.toFixed(2)} budget.`,
        severity: "critical",
        amount: thisTotal - totalBudget,
        is_read: false, is_dismissed: false, is_saved: false,
        metadata_: {}, created_at: now.toISOString(),
      });
    }
  }

  // Savings rate
  if (thisIncome > 0) {
    const savingsRate = ((thisIncome - thisTotal) / thisIncome) * 100;
    if (savingsRate < 10) {
      insights.push({
        id: "low-savings",
        type: "low_savings_rate",
        title: "Savings rate is below 10%",
        body: `Your savings rate this month is ${savingsRate.toFixed(1)}%. Try to aim for at least 20%.`,
        severity: "warning",
        is_read: false, is_dismissed: false, is_saved: false,
        metadata_: { savings_rate: savingsRate }, created_at: now.toISOString(),
      });
    } else if (savingsRate > 20) {
      insights.push({
        id: "great-savings",
        type: "great_savings_rate",
        title: `Great savings rate: ${savingsRate.toFixed(1)}%`,
        body: `You're saving ${savingsRate.toFixed(1)}% of your income this month. Keep it up!`,
        severity: "positive",
        is_read: false, is_dismissed: false, is_saved: false,
        metadata_: { savings_rate: savingsRate }, created_at: now.toISOString(),
      });
    }
  }

  // Goal near completion
  for (const goal of goals.data ?? []) {
    const pct = Number(goal.target_amount) > 0
      ? (Number(goal.current_amount) / Number(goal.target_amount)) * 100 : 0;
    if (pct >= 80 && pct < 100) {
      insights.push({
        id: `goal-near-${goal.id}`,
        type: "goal_near_completion",
        title: `"${goal.name}" is ${Math.round(pct)}% complete`,
        body: `Only $${(Number(goal.target_amount) - Number(goal.current_amount)).toFixed(2)} to go!`,
        severity: "positive",
        is_read: false, is_dismissed: false, is_saved: false,
        metadata_: { goal_id: goal.id }, created_at: now.toISOString(),
      });
    }
  }

  return NextResponse.json(insights.slice(0, 10));
}

export async function POST() {
  return NextResponse.json({ message: "Insights refreshed" });
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}
