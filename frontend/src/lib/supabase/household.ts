import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getHouseholdId(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .single();
  return data?.household_id ?? null;
}

export async function getOrCreateMembership(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<{ household_id: string; role: string } | null> {
  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id, role")
    .eq("user_id", userId)
    .single();

  if (membership) return membership;

  // Use admin client for auto-create to bypass any RLS edge cases
  const admin = createAdminClient();

  const [profileRes, authRes] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    admin.auth.admin.getUserById(userId),
  ]);
  const name =
    profileRes.data?.full_name ||
    authRes.data.user?.email?.split("@")[0] ||
    "My";

  const { data: household, error: hhError } = await admin
    .from("households")
    .insert({ name: `${name}'s Household` })
    .select()
    .single();

  if (hhError || !household) {
    console.error("Failed to create household:", hhError?.message);
    return null;
  }

  await admin
    .from("household_members")
    .insert({ household_id: household.id, user_id: userId, role: "owner" });

  return { household_id: household.id, role: "owner" };
}

// Like getHouseholdId, but auto-creates a household for the user if they don't
// have one yet — matters because auto-creation used to only happen inside
// GET /api/households, which pages like the dashboard never call, so a
// first-time user could hit "No household" 404s before ever visiting Settings.
export async function getOrCreateHouseholdId(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> {
  const membership = await getOrCreateMembership(supabase, userId);
  return membership?.household_id ?? null;
}
