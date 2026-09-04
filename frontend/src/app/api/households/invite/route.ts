import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { randomBytes } from "crypto";
import { sendEmail, inviteEmailHtml } from "@/lib/email";

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id, role")
    .eq("user_id", user.id)
    .single();

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

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`;

  const [householdRes, profileRes] = await Promise.all([
    supabase.from("households").select("name").eq("id", membership.household_id).single(),
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
  ]);

  const { sent, error: emailError } = await sendEmail({
    to: body.email,
    subject: `${profileRes.data?.full_name ?? "Your partner"} invited you to WealthView Duo`,
    html: inviteEmailHtml({
      inviterName: profileRes.data?.full_name ?? "Your partner",
      householdName: householdRes.data?.name ?? "their household",
      inviteUrl,
    }),
  });

  return NextResponse.json(
    { ...data, invite_url: inviteUrl, email_sent: sent, email_error: emailError },
    { status: 201 }
  );
}
