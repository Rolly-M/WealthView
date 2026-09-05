import type { SupabaseClient } from "@supabase/supabase-js";

// Rule-based insight generation, called from three places: the insights
// page's own GET (so opening the page refreshes insights), a manual
// "Refresh" button (POST /api/insights/generate), and the daily cron
// (/api/cron/generate-insights) — none of which should ever produce
// duplicate rows no matter how often they run. dedup_key + the unique
// (household_id, dedup_key) constraint on the insights table is what
// enforces that: this always upserts with ignoreDuplicates, so re-running
// it only inserts an insight the household doesn't already have for that
// period (e.g. a category spending spike is keyed per category+month).
//
// Computed only from shared accounts (is_shared = true) — insights are
// stored once per household and shown identically to both partners, so a
// private account's spending must never factor in here; that would leak
// it into a shared, persisted record.
export async function generateInsightsForHousehold(
  admin: SupabaseClient,
  householdId: string
): Promise<number> {
  const now = new Date();
  const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStart = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}-01`;
  const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const { data: sharedAccounts } = await admin
    .from("accounts")
    .select("id")
    .eq("household_id", householdId)
    .eq("is_active", true)
    .eq("is_shared", true);
  const accountIds = (sharedAccounts ?? []).map((a) => a.id);
  if (accountIds.length === 0) return 0;

  const [thisMonthTxns, lastMonthTxns, budgets, goals] = await Promise.all([
    admin.from("transactions").select("amount, category, is_income").eq("household_id", householdId).in("account_id", accountIds).gte("date", thisMonthStart).eq("is_hidden", false),
    admin.from("transactions").select("amount, category, is_income").eq("household_id", householdId).in("account_id", accountIds).gte("date", lastMonthStart).lt("date", thisMonthStart).eq("is_hidden", false),
    admin.from("budgets").select("*, budget_categories(*)").eq("household_id", householdId).eq("is_active", true),
    admin.from("goals").select("*").eq("household_id", householdId).eq("status", "active"),
  ]);

  type NewInsight = {
    household_id: string; type: string; title: string; body: string; severity: string;
    category?: string; amount?: number; pct_change?: number;
    metadata_: Record<string, unknown>; dedup_key: string;
  };
  const insights: NewInsight[] = [];

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

  for (const [cat, amount] of Object.entries(thisSpend)) {
    const prev = lastSpend[cat] ?? 0;
    if (prev > 0) {
      const pct = ((amount - prev) / prev) * 100;
      if (pct > 30 && amount > 50) {
        insights.push({
          household_id: householdId,
          type: "category_spike",
          title: `${cap(cat)} spending is up ${Math.round(pct)}%`,
          body: `You've spent $${amount.toFixed(2)} on ${cat} this month vs $${prev.toFixed(2)} last month.`,
          severity: pct > 50 ? "warning" : "info",
          category: cat,
          amount,
          pct_change: pct,
          metadata_: {},
          dedup_key: `spike-${cat}-${periodKey}`,
        });
      }
    }
  }

  for (const budget of budgets.data ?? []) {
    const totalBudget = Number(budget.total_amount);
    if (totalBudget > 0 && thisTotal > totalBudget) {
      insights.push({
        household_id: householdId,
        type: "budget_exceeded",
        title: `"${budget.name}" budget exceeded`,
        body: `You've spent $${thisTotal.toFixed(2)} against a $${totalBudget.toFixed(2)} budget.`,
        severity: "critical",
        amount: thisTotal - totalBudget,
        metadata_: {},
        dedup_key: `budget-over-${budget.id}-${periodKey}`,
      });
    }
  }

  if (thisIncome > 0) {
    const savingsRate = ((thisIncome - thisTotal) / thisIncome) * 100;
    if (savingsRate < 10) {
      insights.push({
        household_id: householdId,
        type: "low_savings_rate",
        title: "Savings rate is below 10%",
        body: `Your savings rate this month is ${savingsRate.toFixed(1)}%. Try to aim for at least 20%.`,
        severity: "warning",
        metadata_: { savings_rate: savingsRate },
        dedup_key: `savings-rate-${periodKey}`,
      });
    } else if (savingsRate > 20) {
      insights.push({
        household_id: householdId,
        type: "great_savings_rate",
        title: `Great savings rate: ${savingsRate.toFixed(1)}%`,
        body: `You're saving ${savingsRate.toFixed(1)}% of your income this month. Keep it up!`,
        severity: "positive",
        metadata_: { savings_rate: savingsRate },
        dedup_key: `savings-rate-${periodKey}`,
      });
    }
  }

  for (const goal of goals.data ?? []) {
    const pct = Number(goal.target_amount) > 0
      ? (Number(goal.current_amount) / Number(goal.target_amount)) * 100 : 0;
    if (pct >= 80 && pct < 100) {
      insights.push({
        household_id: householdId,
        type: "goal_near_completion",
        title: `"${goal.name}" is ${Math.round(pct)}% complete`,
        body: `Only $${(Number(goal.target_amount) - Number(goal.current_amount)).toFixed(2)} to go!`,
        severity: "positive",
        metadata_: { goal_id: goal.id },
        dedup_key: `goal-near-${goal.id}`,
      });
    }
  }

  if (insights.length === 0) return 0;

  const { data: inserted, error } = await admin
    .from("insights")
    .upsert(insights, { onConflict: "household_id,dedup_key", ignoreDuplicates: true })
    .select("id");

  if (error) throw error;
  return inserted?.length ?? 0;
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}
