import { NextResponse } from "next/server";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { createClient } from "@/lib/supabase/server";

const plaid = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV ?? "sandbox"],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
        "PLAID-SECRET": process.env.PLAID_SECRET,
      },
    },
  })
);

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("household_members").select("household_id").eq("user_id", user.id).single();
  if (!membership) return NextResponse.json({ error: "No household" }, { status: 404 });

  // Get all Plaid-connected accounts for this household
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, provider_account_id, provider_access_token, current_balance")
    .eq("household_id", membership.household_id)
    .eq("provider", "plaid")
    .eq("is_active", true);

  if (!accounts?.length) return NextResponse.json({ synced: 0 });

  // Sync each unique access token
  const seen = new Set<string>();
  let totalNew = 0;

  for (const acct of accounts) {
    const token = acct.provider_access_token;
    if (!token || seen.has(token)) continue;
    seen.add(token);

    // Refresh balances
    const { data: balData } = await plaid.accountsGet({ access_token: token });
    for (const b of balData.accounts) {
      await supabase
        .from("accounts")
        .update({
          current_balance: b.balances.current ?? 0,
          available_balance: b.balances.available ?? null,
          last_synced_at: new Date().toISOString(),
        })
        .eq("provider_account_id", b.account_id);
    }

    // Build plaid account_id → our Supabase UUID map for this token
    const { data: ourAccounts } = await supabase
      .from("accounts")
      .select("id, provider_account_id")
      .eq("household_id", membership.household_id)
      .eq("provider", "plaid");
    const plaidToUuid = Object.fromEntries(
      (ourAccounts ?? []).map((a) => [a.provider_account_id, a.id])
    );

    // Sync new transactions
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const { data } = await plaid.transactionsSync({
        access_token: token,
        cursor,
        options: { include_personal_finance_category: true },
      });

      const toInsert = data.added
        .filter((t) => plaidToUuid[t.account_id])
        .map((t) => ({
        account_id: plaidToUuid[t.account_id],  // ← correct Supabase UUID
        household_id: membership.household_id,
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

      if (toInsert.length > 0) {
        const { data: upserted } = await supabase
          .from("transactions")
          .upsert(toInsert, { onConflict: "provider_transaction_id" })
          .select("id");
        totalNew += upserted?.length ?? 0;
      }

      // Remove deleted transactions
      for (const t of data.removed) {
        await supabase
          .from("transactions")
          .delete()
          .eq("provider_transaction_id", t.transaction_id);
      }

      cursor = data.next_cursor;
      hasMore = data.has_more;
    }
  }

  return NextResponse.json({ synced: totalNew, accounts: accounts.length });
}

function mapCategory(plaidCategory: string): string {
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
