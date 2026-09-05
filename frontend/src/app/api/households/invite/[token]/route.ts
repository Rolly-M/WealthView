import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _req: Request,
  { params }: { params: { token: string } }
) {
  const supabase = createClient();
  const { data: rows } = await supabase.rpc("get_invitation_by_token", {
    p_token: params.token,
  });
  const invite = rows?.[0];

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

  // Admin client (bypasses RLS) rather than the caller's own session —
  // matches /api/auth/callback's Google path, and sidesteps the same class
  // of "RLS policy silently returns no row" failure mode found there
  // instead of relying on invitations_select_own_email being satisfied.
  const admin = createAdminClient();

  const { data: invite } = await admin
    .from("invitations")
    .select("*")
    .eq("token", params.token)
    .single();

  if (!invite || invite.status !== "pending") {
    return NextResponse.json({ error: "Invalid invitation" }, { status: 400 });
  }

  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: "Invitation has expired" }, { status: 410 });
  }

  // Invites are open shareable links by default (no target email) — only
  // enforce a match for the older style that does address one.
  if (invite.email && invite.email.toLowerCase() !== user.email?.toLowerCase()) {
    return NextResponse.json(
      { error: "This invitation was sent to a different email address" },
      { status: 403 }
    );
  }

  // Atomic claim — the earlier status check and this update aren't the
  // same operation, so two concurrent accepts (double-click, two tabs)
  // could otherwise both pass the check before either had written
  // "accepted", both then inserting a household_members row. Conditioning
  // the update on status still being "pending" makes Postgres itself the
  // arbiter: only one concurrent request can match and update the row.
  const { data: claimed } = await admin
    .from("invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", invite.id)
    .eq("status", "pending")
    .select()
    .single();

  if (!claimed) {
    return NextResponse.json({ error: "This invitation has already been used" }, { status: 410 });
  }

  const { error: insertError } = await admin
    .from("household_members")
    .insert({ household_id: invite.household_id, user_id: user.id, role: invite.role });

  if (insertError) {
    // Give the invite back rather than burning it on an unrelated failure
    // (e.g. this user is already a member of some household).
    await admin.from("invitations").update({ status: "pending", accepted_at: null }).eq("id", invite.id);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ household_id: invite.household_id });
}
