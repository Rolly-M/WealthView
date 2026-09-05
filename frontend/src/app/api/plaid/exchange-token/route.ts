import { NextResponse } from "next/server";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateHouseholdId } from "@/lib/supabase/household";
import { syncPlaidTransactions } from "@/lib/plaid";

// This handler syncs the linked account's full transaction history before
// responding, which regularly exceeds Vercel's default 10s function
// timeout for real accounts — the client would then just see a hung
// "Importing…" request. 60s is Vercel's cap on the Hobby plan.
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

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { public_token, institution_name } = await req.json();

  const householdId = await getOrCreateHouseholdId(supabase, user.id);
  if (!householdId) return NextResponse.json({ error: "No household" }, { status: 404 });

  try {
    // Exchange public token for access token
    const { data: exchangeData } = await plaid.itemPublicTokenExchange({ public_token });
    const accessToken = exchangeData.access_token;
    const itemId = exchangeData.item_id;

    // Fetch accounts from Plaid
    const { data: accountsData } = await plaid.accountsGet({ access_token: accessToken });

    const accountTypeMap: Record<string, string> = {
      depository: "checking", credit: "credit", loan: "loan",
      investment: "investment", other: "other",
    };
    const subtypeMap: Record<string, string> = {
      checking: "checking", savings: "savings",
      "credit card": "credit", mortgage: "mortgage", auto: "loan",
    };

    // Insert/update each Plaid account and build plaidId → supabaseUUID map.
    // Atomic upsert on provider_account_id — requires the unique constraint added
    // by supabase/accounts_unique_provider_account_id.sql — so concurrent Link
    // flows (double-click, retry, or a race with /plaid/sync) can't both see "no
    // existing row" and insert duplicates.
    //
    // provider_account_id is only stable within one Plaid Item, though — fully
    // re-linking the same institution (a fresh Link session, not a reconnect
    // of an existing item) mints a new Item with brand-new account_ids for the
    // same real accounts, so the upsert above wouldn't recognize it and would
    // insert a second copy. Matching on (household, mask, name) first catches
    // that case and updates the existing row in place instead.
    const plaidToUuid: Record<string, string> = {};

    for (const acct of accountsData.accounts) {
      const accountPayload = {
        household_id: householdId,
        owner_id: user.id,
        provider: "plaid",
        provider_account_id: acct.account_id,
        provider_access_token: accessToken,
        name: acct.name,
        official_name: acct.official_name ?? null,
        mask: acct.mask ?? null,
        institution_name: institution_name ?? null,
        type: accountTypeMap[acct.type] ?? "other",
        subtype: subtypeMap[acct.subtype ?? ""] ?? acct.subtype ?? null,
        currency: acct.balances.iso_currency_code ?? "USD",
        current_balance: acct.balances.current ?? 0,
        available_balance: acct.balances.available ?? null,
        credit_limit: acct.balances.limit ?? null,
        is_shared: true,
        is_active: true,
        last_synced_at: new Date().toISOString(),
      };

      let existingId: string | null = null;
      if (acct.mask) {
        const { data: existing } = await supabase
          .from("accounts")
          .select("id")
          .eq("household_id", householdId)
          .eq("provider", "plaid")
          .eq("mask", acct.mask)
          .eq("name", acct.name)
          .eq("is_active", true)
          .neq("provider_account_id", acct.account_id)
          .maybeSingle();
        existingId = existing?.id ?? null;
      }

      const { data: upserted, error: upsertError } = existingId
        ? await supabase.from("accounts").update(accountPayload).eq("id", existingId).select("id").single()
        : await supabase.from("accounts").upsert(accountPayload, { onConflict: "provider_account_id" }).select("id").single();

      if (upsertError) throw upsertError;
      if (upserted) plaidToUuid[acct.account_id] = upserted.id;
    }

    // Sync initial transactions using the correct UUID mapping
    await syncPlaidTransactions(supabase, plaid, accessToken, householdId, plaidToUuid);

    return NextResponse.json({ accounts: Object.keys(plaidToUuid).length, item_id: itemId });
  } catch (err: unknown) {
    const plaidErr = (err as { response?: { data?: unknown } })?.response?.data;
    const message = plaidErr
      ? JSON.stringify(plaidErr)
      : (err as Error)?.message ?? "Plaid API error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
