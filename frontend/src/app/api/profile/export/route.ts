import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getHouseholdId } from "@/lib/supabase/household";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Read-only export shouldn't have the side effect of creating a
  // household for a user who doesn't have one yet.
  const householdId = await getHouseholdId(supabase, user.id);

  const [profileRes, accountsRes, txnsRes, budgetsRes, goalsRes] = await Promise.all([
    supabase.from("profiles").select("full_name, avatar_url, currency, locale, created_at").eq("id", user.id).single(),
    householdId
      ? supabase.from("accounts")
          // provider_access_token deliberately excluded — it's a live Plaid
          // credential, not personal data, and must never leave the server.
          .select("id, name, official_name, type, subtype, currency, current_balance, available_balance, credit_limit, is_shared, is_active, include_in_net_worth, provider, mask, institution_name, last_synced_at, created_at")
          .eq("household_id", householdId)
      : Promise.resolve({ data: [] }),
    householdId
      ? supabase.from("transactions").select("*").eq("household_id", householdId)
      : Promise.resolve({ data: [] }),
    householdId
      ? supabase.from("budgets").select("*, categories:budget_categories(*)").eq("household_id", householdId)
      : Promise.resolve({ data: [] }),
    householdId
      ? supabase.from("goals").select("*").eq("household_id", householdId)
      : Promise.resolve({ data: [] }),
  ]);

  const exportData = {
    exported_at: new Date().toISOString(),
    account_email: user.email,
    profile: profileRes.data,
    accounts: accountsRes.data ?? [],
    transactions: txnsRes.data ?? [],
    budgets: budgetsRes.data ?? [],
    goals: goalsRes.data ?? [],
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="wealthview-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
