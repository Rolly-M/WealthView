import { createClient } from "@/lib/supabase/server";

// An account is visible to a household member if they own it, or its
// owner marked it shared. is_shared previously only drove a cosmetic
// "Private" badge — every account-reading endpoint still returned every
// household account regardless, so a partner could see (and, via
// PATCH/DELETE with no owner check, even edit or disconnect) an account
// its owner had marked private. This is the actual enforcement point:
// every route that lists accounts, or aggregates transactions by account,
// should restrict to this set for the requesting user.
export async function getVisibleAccountIds(
  supabase: ReturnType<typeof createClient>,
  householdId: string,
  viewerId: string
): Promise<string[]> {
  const { data } = await supabase
    .from("accounts")
    .select("id")
    .eq("household_id", householdId)
    .eq("is_active", true)
    .or(`owner_id.eq.${viewerId},is_shared.eq.true`);
  return (data ?? []).map((a) => a.id);
}
