import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getHouseholdId } from "@/lib/supabase/household";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const householdId = await getHouseholdId(supabase, user.id);
  if (!householdId) return NextResponse.json({ error: "No household" }, { status: 404 });

  const { action } = await req.json().catch(() => ({}));

  const { data: existing } = await supabase
    .from("insights")
    .select("is_saved")
    .eq("id", params.id)
    .eq("household_id", householdId)
    .single();
  if (!existing) return NextResponse.json({ error: "Insight not found" }, { status: 404 });

  const updates: Record<string, boolean> =
    action === "read" ? { is_read: true }
    : action === "dismiss" ? { is_dismissed: true }
    : action === "save" ? { is_saved: !existing.is_saved }
    : {};

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("insights")
    .update(updates)
    .eq("id", params.id)
    .eq("household_id", householdId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
