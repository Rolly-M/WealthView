import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id, role, nickname, joined_at")
    .eq("user_id", user.id)
    .single();

  if (!membership) return NextResponse.json({ error: "No household found" }, { status: 404 });

  const { data: household } = await supabase
    .from("households")
    .select("*")
    .eq("id", membership.household_id)
    .single();

  const { data: members } = await supabase
    .from("household_members")
    .select("id, role, nickname, joined_at, profiles(id, full_name, avatar_url, currency, locale)")
    .eq("household_id", membership.household_id);

  const { data: invitations } = await supabase
    .from("invitations")
    .select("*")
    .eq("household_id", membership.household_id)
    .eq("status", "pending");

  return NextResponse.json({
    ...household,
    members: members ?? [],
    pending_invitations: invitations ?? [],
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
    .from("household_members")
    .select("household_id, role")
    .eq("user_id", user.id)
    .single();

  if (!membership) return NextResponse.json({ error: "No household" }, { status: 404 });

  const body = await req.json();
  const allowed = ["name", "currency", "country"];
  const updates = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

  const { data, error } = await supabase
    .from("households")
    .update(updates)
    .eq("id", membership.household_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
