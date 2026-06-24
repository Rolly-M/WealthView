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
    depository: "checking",
    credit: "credit",
    loan: "loan",
    investment: "investment",
    other: "other",
  };

  const subtypeMap: Record<string, string> = {
    checking: "checking",
    savings: "savings",
    "credit card": "credit",
    mortgage: "mortgage",
    auto: "loan",
  };

  // Insert each account into Supabase
  const insertedAccounts = [];
  for (const acct of accountsData.accounts) {
    const { data: inserted } = await supabase
      .from("accounts")
      .upsert({
        household_id: membership.household_id,
        owner_id: user.id,
        provider: "plaid",
        provider_account_id: acct.account_id,
        provider_access_token: accessToken,
        name: acct.name,
        official_name: acct.official_name,
        type: accountTypeMap[acct.type] ?? "other",
        subtype: subtypeMap[acct.subtype ?? ""] ?? acct.subtype ?? null,
        currency: acct.balances.iso_currency_code ?? "USD",
        current_balance: acct.balances.current ?? 0,
        available_balance: acct.balances.available ?? null,
        credit_limit: acct.balances.limit ?? null,
        is_shared: true,
        is_active: true,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: "provider_account_id" })
      .select()
      .single();

    if (inserted) insertedAccounts.push(inserted);
  }

  // Initial transaction sync (last 90 days)
  await syncTransactions(supabase, plaid, accessToken, membership.household_id);

  return NextResponse.json({ accounts: insertedAccounts, item_id: itemId });
}

async function syncTransactions(
  supabase: ReturnType<typeof import("@/lib/supabase/server").createClient>,
  plaid: PlaidApi,
  accessToken: string,
  householdId: string
) {
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const { data } = await plaid.transactionsSync({
      access_token: accessToken,
      cursor,
      options: { include_personal_finance_category: true },
    });

    const toInsert = data.added.map((t) => ({
      account_id: t.account_id,
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
      await supabase.from("transactions").upsert(toInsert, { onConflict: "provider_transaction_id" });
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
