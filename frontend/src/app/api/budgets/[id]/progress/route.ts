import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: budget } = await supabase
    .from("budgets")
    .select("*, categories:budget_categories(*)")
    .eq("id", params.id)
    .single();

  if (!budget) return NextResponse.json({ error: "Budget not found" }, { status: 404 });

  const now = new Date();
  const year = budget.year ?? now.getFullYear();
  const month = budget.month ?? now.getMonth() + 1;
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const { data: txns } = await supabase
    .from("transactions")
    .select("amount, category")
    .eq("household_id", budget.household_id)
    .eq("is_hidden", false)
    .eq("is_income", false)
    .gte("date", startDate)
    .lte("date", endDate);

  let totalSpent = 0;
  const spentByCategory: Record<string, number> = {};
  for (const t of txns ?? []) {
    const a = Math.abs(Number(t.amount));
    totalSpent += a;
    spentByCategory[t.category] = (spentByCategory[t.category] ?? 0) + a;
  }

  const daysInMonth = lastDay;
  const dayOfMonth = Math.min(now.getDate(), daysInMonth);
  const daysRemaining = daysInMonth - dayOfMonth;

  const categoriesProgress = (budget.categories ?? []).map(
    (c: { category: string; amount: number }) => ({
      category: c.category,
      budget: Number(c.amount),
      spent: spentByCategory[c.category] ?? 0,
      pct: Number(c.amount) > 0 ? ((spentByCategory[c.category] ?? 0) / Number(c.amount)) * 100 : 0,
    })
  );

  const totalBudget = Number(budget.total_amount);
  return NextResponse.json({
    budget,
    total_spent: totalSpent,
    total_budget: totalBudget,
    pct_used: totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0,
    days_remaining: daysRemaining,
    projected_overspend: dayOfMonth > 0
      ? (totalSpent / dayOfMonth) * daysInMonth > totalBudget
        ? (totalSpent / dayOfMonth) * daysInMonth - totalBudget
        : null
      : null,
    categories_progress: categoriesProgress,
  });
}
