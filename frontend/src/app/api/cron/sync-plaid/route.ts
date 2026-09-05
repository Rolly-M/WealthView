import { NextResponse } from "next/server";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncPlaidTransactions, backfillInstitutionName } from "@/lib/plaid";

// Runs once daily via Vercel Cron (see vercel.json) — Hobby plan caps cron
// jobs at once-per-day. Not tied to any one signed-in user like
// /api/plaid/sync (there's no session on a cron trigger), so this walks
// every active Plaid account across every household directly via the
// admin client.
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

export async function GET(request: Request) {
  // Vercel automatically sends this header on its own cron-triggered
  // requests when CRON_SECRET is set, so this also blocks the endpoint
  // from being hit by anyone who finds the URL.
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: accounts, error } = await admin
    .from("accounts")
    .select("id, household_id, provider_account_id, provider_access_token, plaid_cursor, institution_name")
    .eq("provider", "plaid")
    .eq("is_active", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!accounts?.length) return NextResponse.json({ synced: 0, tokens_processed: 0 });

  const seen = new Set<string>();
  let totalNew = 0;
  let tokensProcessed = 0;
  const failures: string[] = [];

  for (const acct of accounts) {
    const token = acct.provider_access_token;
    if (!token || seen.has(token)) continue;
    seen.add(token);
    tokensProcessed++;

    try {
      if (!acct.institution_name) {
        await backfillInstitutionName(admin, plaid, token, acct.household_id).catch(() => {});
      }

      const { data: balData } = await plaid.accountsGet({ access_token: token });
      for (const b of balData.accounts) {
        await admin
          .from("accounts")
          .update({
            current_balance: b.balances.current ?? 0,
            available_balance: b.balances.available ?? null,
            last_synced_at: new Date().toISOString(),
          })
          .eq("provider_account_id", b.account_id);
      }

      const { data: ourAccounts } = await admin
        .from("accounts")
        .select("id, provider_account_id")
        .eq("provider", "plaid")
        .eq("provider_access_token", token);
      const plaidToUuid = Object.fromEntries((ourAccounts ?? []).map((a) => [a.provider_account_id, a.id]));

      const { added } = await syncPlaidTransactions(
        admin, plaid, token, acct.household_id, plaidToUuid, acct.plaid_cursor ?? undefined
      );
      totalNew += added;
    } catch (err: unknown) {
      // One item's failure (e.g. a revoked bank connection) shouldn't
      // abort syncing everyone else's.
      console.error("Cron sync failed for a Plaid item:", err);
      failures.push(token.slice(-6));
    }
  }

  return NextResponse.json({ synced: totalNew, tokens_processed: tokensProcessed, failures });
}
