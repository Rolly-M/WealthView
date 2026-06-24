import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: { token: string } }
) {
  const supabase = createClient();
  const { data: invite } = await supabase
    .from("invitations")
    .select("*, households(name)")
    .eq("token", params.token)
    .single();

  if (!invite) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  if (invite.status !== "pending") {
    return NextResponse.json({ error: "Invitation has already been used" }, { status: 410 });
  }
  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: "Invitation has expired" }, { status: 410 });
  }

  return NextResponse.json(invite);
}

export async function POST(
  _req: Request,
  { params }: { params: { token: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: invite } = await supabase
    .from("invitations")
    .select("*")
    .eq("token", params.token)
    .single();

  if (!invite || invite.status !== "pending") {
    return NextResponse.json({ error: "Invalid invitation" }, { status: 400 });
  }

  await supabase
    .from("household_members")
    .insert({ household_id: invite.household_id, user_id: user.id, role: invite.role });

  await supabase
    .from("invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  return NextResponse.json({ household_id: invite.household_id });
}
