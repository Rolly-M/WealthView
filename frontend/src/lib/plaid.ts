import type { PlaidApi } from "plaid";
import type { createClient } from "@/lib/supabase/server";

export function mapCategory(plaidCategory: string): string {
  const c = plaidCategory.toLowerCase();
  if (c.includes("food") || c.includes("grocer")) return "groceries";
  if (c.includes("restaurant") || c.includes("dining") || c.includes("fast_food")) return "dining";
  if (c.includes("travel") || c.includes("airline") || c.includes("hotel")) return "travel";
  if (c.includes("transport") || c.includes("gas") || c.includes("taxi") || c.includes("auto")) return "transportation";
  if (c.includes("utilities") || c.includes("electric") || c.includes("water") || c.includes("internet")) return "utilities";
  if (c.includes("income") || c.includes("payroll") || c.includes("deposit")) return "income";
  if (c.includes("transfer") || c.includes("payment")) return "transfer";
  if (c.includes("subscription") || c.includes("streaming")) return "subscription";
  if (c.includes("medical") || c.includes("health") || c.includes("pharmacy")) return "health";
  if (c.includes("education") || c.includes("school")) return "education";
  if (c.includes("entertainment") || c.includes("recreation")) return "entertainment";
  if (c.includes("shopping") || c.includes("merchandise") || c.includes("clothing")) return "shopping";
  if (c.includes("rent") || c.includes("mortgage") || c.includes("housing")) return "housing";
  if (c.includes("insurance")) return "insurance";
  if (c.includes("loan") || c.includes("credit")) return "debt_payment";
  return "miscellaneous";
}

// Shared by /api/plaid/exchange-token (initial sync) and /api/plaid/sync
// (manual re-sync) — kept in one place after exchange-token's own copy of
// this loop drifted from sync's and never handled `removed`. Plaid reports
// a pending transaction's id there when it replaces it with a posted one
// under a NEW id, so skipping `removed` leaves both the pending and posted
// copies of the same real transaction sitting in the table as apparent
// duplicates. `modified` covers updates (e.g. amount corrections) to a
// transaction that keeps its existing id.
export async function syncPlaidTransactions(
  supabase: ReturnType<typeof createClient>,
  plaid: PlaidApi,
  accessToken: string,
  householdId: string,
  plaidToUuid: Record<string, string>,
  startCursor?: string
): Promise<{ added: number }> {
  let cursor = startCursor;
  let hasMore = true;
  let added = 0;

  while (hasMore) {
    const { data } = await plaid.transactionsSync({
      access_token: accessToken,
      cursor,
      options: { include_personal_finance_category: true },
    });

    const toUpsert = [...data.added, ...data.modified]
      .filter((t) => plaidToUuid[t.account_id])
      .map((t) => ({
        account_id: plaidToUuid[t.account_id],
        household_id: householdId,
        provider_transaction_id: t.transaction_id,
        amount: Math.abs(t.amount),
        currency: t.iso_currency_code ?? "USD",
        date: t.date,
        merchant_name: t.merchant_name ?? t.name,
        description: t.name,
        category: mapCategory(t.personal_finance_category?.primary ?? t.category?.[0] ?? ""),
        is_income: t.amount < 0,
        is_pending: t.pending,
        tags: [],
      }));

    if (toUpsert.length > 0) {
      const { data: upserted, error } = await supabase
        .from("transactions")
        .upsert(toUpsert, { onConflict: "provider_transaction_id" })
        .select("id");
      if (error) throw error;
      added += upserted?.length ?? 0;
    }

    for (const t of data.removed) {
      if (!t.transaction_id) continue;
      await supabase.from("transactions").delete().eq("provider_transaction_id", t.transaction_id);
    }

    cursor = data.next_cursor;
    hasMore = data.has_more;

    // Persist progress after every page, not just at the end — if this
    // function gets cut off by the serverless timeout partway through a
    // long history, the next sync resumes from here instead of restarting
    // the whole history from scratch.
    await supabase
      .from("accounts")
      .update({ plaid_cursor: cursor })
      .in("id", Object.values(plaidToUuid));
  }

  return { added };
}
