import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateHouseholdId } from "@/lib/supabase/household";
import { generateInsightsForHousehold } from "@/lib/insights";

// Manual "Refresh" button on the Insights page. Same dedup'd generation as
// the automatic GET-triggered and daily-cron paths — this just lets the
// user force a re-check without waiting.
export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const householdId = await getOrCreateHouseholdId(supabase, user.id);
  if (!householdId) return NextResponse.json({ error: "No household" }, { status: 404 });

  const admin = createAdminClient();
  const added = await generateInsightsForHousehold(admin, householdId);

  return NextResponse.json({ added });
}
