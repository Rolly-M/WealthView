import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function getOrCreateMembership(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id, role")
    .eq("user_id", userId)
    .single();

  if (membership) return membership;

  // Auto-create household for users who signed up before the callback was in place
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .single();

  const admin = createAdminClient();
  const { data: authData } = await admin.auth.admin.getUserById(userId);
  const name = profile?.full_name || authData.user?.email?.split("@")[0] || "My";

  const { data: household } = await supabase
    .from("households")
    .insert({ name: `${name}'s Household` })
    .select()
    .single();

  if (!household) return null;

  await supabase
    .from("household_members")
    .insert({ household_id: household.id, user_id: userId, role: "owner" });

  return { household_id: household.id, role: "owner" };
}

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getOrCreateMembership(supabase, user.id);
  if (!membership) return NextResponse.json({ error: "Failed to create household" }, { status: 500 });

  const [householdRes, membersRes, invitationsRes] = await Promise.all([
    supabase.from("households").select("*").eq("id", membership.household_id).single(),
    supabase.from("household_members")
      .select("id, role, nickname, joined_at, user_id, profiles(id, full_name, avatar_url, currency, locale)")
      .eq("household_id", membership.household_id),
    supabase.from("invitations").select("*")
      .eq("household_id", membership.household_id).eq("status", "pending"),
  ]);

  const admin = createAdminClient();
  const memberUserIds = (membersRes.data ?? []).map((m) => m.user_id);
  const emailMap: Record<string, string> = {};
  for (const uid of memberUserIds) {
    const { data } = await admin.auth.admin.getUserById(uid);
    if (data.user) emailMap[uid] = data.user.email ?? "";
  }

  type ProfileRow = { id: string; full_name: string; avatar_url: string | null; currency: string; locale: string } | null;
  const members = (membersRes.data ?? []).map((m) => {
    const profile = m.profiles as unknown as ProfileRow;
    return {
      id: m.id,
      role: m.role,
      nickname: m.nickname,
      joined_at: m.joined_at,
      share_all_accounts: true,
      user: {
        id: m.user_id,
        email: emailMap[m.user_id] ?? "",
        full_name: profile?.full_name ?? "Unknown",
        avatar_url: profile?.avatar_url ?? null,
        currency: profile?.currency ?? "USD",
        locale: profile?.locale ?? "en-US",
        is_verified: true,
        created_at: m.joined_at,
      },
    };
  });

  return NextResponse.json({
    ...householdRes.data,
    members,
    pending_invitations: invitationsRes.data ?? [],
  });
}

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { data: household, error } = await supabase
    .from("households")
    .insert({ name: body.name ?? "Our Household", currency: body.currency ?? "USD" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase
    .from("household_members")
    .insert({ household_id: household.id, user_id: user.id, role: "owner" });

  return NextResponse.json(household, { status: 201 });
}

export async function PATCH(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("household_members").select("household_id").eq("user_id", user.id).single();
  if (!membership) return NextResponse.json({ error: "No household" }, { status: 404 });

  const body = await req.json();
  const allowed = ["name", "currency", "country"];
  const updates = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

  const { data, error } = await supabase
    .from("households").update(updates).eq("id", membership.household_id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
