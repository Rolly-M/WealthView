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

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { public_token } = await req.json();

  const { data: membership } = await supabase
    .from("household_members").select("household_id").eq("user_id", user.id).single();
  if (!membership) return NextResponse.json({ error: "No household" }, { status: 404 });

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

  // Insert/update each Plaid account and build plaidId → supabaseUUID map
  // Using select+insert/update instead of upsert (no unique constraint needed)
  const plaidToUuid: Record<string, string> = {};

  for (const acct of accountsData.accounts) {
    const accountPayload = {
      household_id: membership.household_id,
      owner_id: user.id,
      provider: "plaid",
      provider_account_id: acct.account_id,
      provider_access_token: accessToken,
      name: acct.name,
      official_name: acct.official_name ?? null,
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

    // Check if this Plaid account already exists
    const { data: existing } = await supabase
      .from("accounts")
      .select("id")
      .eq("provider_account_id", acct.account_id)
      .single();

    if (existing) {
      // Update balance + token
      await supabase
        .from("accounts")
        .update({
          current_balance: accountPayload.current_balance,
          available_balance: accountPayload.available_balance,
          provider_access_token: accessToken,
          last_synced_at: accountPayload.last_synced_at,
        })
        .eq("id", existing.id);
      plaidToUuid[acct.account_id] = existing.id;
    } else {
      // Insert new account
      const { data: inserted } = await supabase
        .from("accounts")
        .insert(accountPayload)
        .select("id")
        .single();
      if (inserted) plaidToUuid[acct.account_id] = inserted.id;
    }
  }

  // Sync initial transactions using the correct UUID mapping
  await syncTransactions(supabase, plaid, accessToken, membership.household_id, plaidToUuid);

  return NextResponse.json({ accounts: Object.keys(plaidToUuid).length, item_id: itemId });
}

async function syncTransactions(
  supabase: ReturnType<typeof import("@/lib/supabase/server").createClient>,
  plaid: PlaidApi,
  accessToken: string,
  householdId: string,
  plaidToUuid: Record<string, string>
) {
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const { data } = await plaid.transactionsSync({
      access_token: accessToken,
      cursor,
      options: { include_personal_finance_category: true },
    });

    const toInsert = data.added
      .filter((t) => plaidToUuid[t.account_id]) // skip if no UUID mapping
      .map((t) => ({
        account_id: plaidToUuid[t.account_id],  // ← correct Supabase UUID
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

    if (toInsert.length > 0) {
      await supabase
        .from("transactions")
        .upsert(toInsert, { onConflict: "provider_transaction_id" });
    }

    cursor = data.next_cursor;
    hasMore = data.has_more;
  }
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
