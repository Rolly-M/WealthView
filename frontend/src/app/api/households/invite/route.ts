import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateMembership } from "@/lib/supabase/household";
import { randomBytes } from "crypto";

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getOrCreateMembership(supabase, user.id);

  if (!membership) return NextResponse.json({ error: "No household" }, { status: 404 });
  if (membership.role !== "owner" && membership.role !== "editor") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const body = await req.json();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("invitations")
    .insert({
      household_id: membership.household_id,
      inviter_id: user.id,
      email: body.email,
      role: body.role ?? "editor",
      token,
      status: "pending",
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // The invite is a shareable link the household owner sends themselves
  // (email, text, WhatsApp, whatever) rather than an email this endpoint
  // sends on their behalf — Resend's sandbox sender can't reach arbitrary
  // recipients without a verified domain, so an auto-sent email isn't
  // reliable enough to depend on here.
  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`;

  return NextResponse.json({ ...data, invite_url: inviteUrl }, { status: 201 });
}
