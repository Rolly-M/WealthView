import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateInsightsForHousehold } from "@/lib/insights";

// Daily backstop for insight generation — the insights page and manual
// "Refresh" button already trigger the same dedup'd generation on demand,
// so this mainly covers a household that hasn't opened the app in a
// while. Hobby plan caps Vercel Cron at once-per-day.
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: households, error } = await admin.from("households").select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let totalAdded = 0;
  const failures: string[] = [];

  for (const h of households ?? []) {
    try {
      totalAdded += await generateInsightsForHousehold(admin, h.id);
    } catch (err: unknown) {
      console.error("Insight generation failed for household", h.id, err);
      failures.push(h.id);
    }
  }

  return NextResponse.json({ households_processed: households?.length ?? 0, insights_added: totalAdded, failures });
}
