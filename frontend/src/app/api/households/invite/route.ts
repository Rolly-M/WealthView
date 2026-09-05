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

  // No email required — this is a plain shareable link now (text, email,
  // WhatsApp, whatever); whoever opens it and signs up joins the
  // household. Still accepts an optional email for anyone who wants to
  // address it, kept working exactly as before if provided.
  const body = await req.json().catch(() => ({}));
  // base64url instead of hex roughly halves the link length for the same
  // entropy (12 chars vs 64) — plenty given invites are also gated by
  // single-use status and a 7-day expiry.
  const token = randomBytes(9).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("invitations")
    .insert({
      household_id: membership.household_id,
      inviter_id: user.id,
      email: body.email ?? null,
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
