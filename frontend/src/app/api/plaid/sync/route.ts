import { NextResponse } from "next/server";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateHouseholdId } from "@/lib/supabase/household";
import { syncPlaidTransactions, backfillInstitutionName } from "@/lib/plaid";

// Re-syncs full transaction history for every linked account on each call —
// can exceed Vercel's default 10s function timeout. 60s is the cap on the
// Hobby plan.
export const maxDuration = 60;

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

  const householdId = await getOrCreateHouseholdId(supabase, user.id);
  if (!householdId) return NextResponse.json({ error: "No household" }, { status: 404 });

  // Get all Plaid-connected accounts for this household
  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id, provider_account_id, provider_access_token, current_balance, plaid_cursor, institution_name")
    .eq("household_id", householdId)
    .eq("provider", "plaid")
    .eq("is_active", true);

  if (accountsError) return NextResponse.json({ error: accountsError.message }, { status: 400 });
  if (!accounts?.length) return NextResponse.json({ synced: 0 });

  try {
    // Sync each unique access token
    const seen = new Set<string>();
    let totalNew = 0;

    for (const acct of accounts) {
      const token = acct.provider_access_token;
      if (!token || seen.has(token)) continue;
      seen.add(token);

      if (!acct.institution_name) {
        await backfillInstitutionName(supabase, plaid, token, householdId).catch((err) =>
          console.error("Failed to backfill institution name:", err)
        );
      }

      // Refresh balances
      const { data: balData } = await plaid.accountsGet({ access_token: token });
      for (const b of balData.accounts) {
        const { error: balanceError } = await supabase
          .from("accounts")
          .update({
            current_balance: b.balances.current ?? 0,
            available_balance: b.balances.available ?? null,
            last_synced_at: new Date().toISOString(),
          })
          .eq("provider_account_id", b.account_id);
        if (balanceError) console.error("Failed to update balance for", b.account_id, balanceError.message);
      }

      // Build plaid account_id → our Supabase UUID map, scoped to accounts
      // under this specific access token (not the whole household) so the
      // cursor persisted below doesn't get written to unrelated items.
      const { data: ourAccounts, error: ourAccountsError } = await supabase
        .from("accounts")
        .select("id, provider_account_id")
        .eq("household_id", householdId)
        .eq("provider", "plaid")
        .eq("provider_access_token", token);
      if (ourAccountsError) throw ourAccountsError;
      const plaidToUuid = Object.fromEntries(
        (ourAccounts ?? []).map((a) => [a.provider_account_id, a.id])
      );

      // Resume from wherever this item's last sync left off instead of
      // re-walking its entire transaction history from scratch every time.
      const { added } = await syncPlaidTransactions(
        supabase, plaid, token, householdId, plaidToUuid, acct.plaid_cursor ?? undefined
      );
      totalNew += added;
    }

    return NextResponse.json({ synced: totalNew, accounts: accounts.length });
  } catch (err: unknown) {
    const plaidErr = (err as { response?: { data?: unknown } })?.response?.data;
    const message = plaidErr
      ? JSON.stringify(plaidErr)
      : (err as Error)?.message ?? "Plaid API error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
