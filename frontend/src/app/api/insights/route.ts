import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateHouseholdId } from "@/lib/supabase/household";
import { generateInsightsForHousehold } from "@/lib/insights";

export async function GET(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const householdId = await getOrCreateHouseholdId(supabase, user.id);
  if (!householdId) return NextResponse.json([]);

  // Regenerate (upsert, dedup'd) on every page load in addition to the
  // daily cron — cheap since it only ever inserts what's genuinely new for
  // the current period, never duplicates. Uses the admin client since
  // generation reads across the whole household, not just this viewer.
  const admin = createAdminClient();
  await generateInsightsForHousehold(admin, householdId).catch((err) =>
    console.error("Failed to generate insights:", err)
  );

  const { searchParams } = new URL(req.url);
  const includeDismissed = searchParams.get("include_dismissed") === "true";
  const limit = parseInt(searchParams.get("limit") ?? "20");

  let query = supabase
    .from("insights")
    .select("*")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!includeDismissed) query = query.eq("is_dismissed", false);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? []);
}
