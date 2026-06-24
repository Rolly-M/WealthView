import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .single();

  if (!membership) return NextResponse.json({ total_assets: 0, total_liabilities: 0, net_worth: 0, accounts_by_type: {} });

  const { data: accounts } = await supabase
    .from("accounts")
    .select("*")
    .eq("household_id", membership.household_id)
    .eq("is_active", true)
    .eq("include_in_net_worth", true);

  const accountsByType: Record<string, typeof accounts> = {};
  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const acc of accounts ?? []) {
    if (!accountsByType[acc.type]) accountsByType[acc.type] = [];
    accountsByType[acc.type]!.push(acc);

    const balance = Number(acc.current_balance);
    if (acc.type === "credit" || acc.type === "loan" || acc.type === "mortgage") {
      totalLiabilities += Math.abs(balance);
    } else {
      totalAssets += balance;
    }
  }

  return NextResponse.json({
    total_assets: totalAssets,
    total_liabilities: totalLiabilities,
    net_worth: totalAssets - totalLiabilities,
    accounts_by_type: accountsByType,
  });
}
