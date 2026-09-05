import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, verificationEmailHtml } from "@/lib/email";

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user: sessionUser } } = await supabase.auth.getUser();
  const admin = createAdminClient();

  let user: { id: string; email?: string } | null = sessionUser;

  if (!user) {
    // No session yet — this happens right after signUp() when Supabase's
    // own "Confirm email" toggle is on, since it withholds the session
    // until that confirmation link is clicked. The caller passes the id
    // signUp() just handed back so we can still send our own branded
    // email in that case.
    const { userId } = await request.json().catch(() => ({ userId: undefined }));
    if (typeof userId !== "string" || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    user = data.user;
  }

  if (!user.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, email_verified")
    .eq("id", user.id)
    .single();

  if (profile?.email_verified) {
    return NextResponse.json({ sent: false, already_verified: true });
  }

  const { data: recent } = await admin
    .from("email_verifications")
    .select("created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (recent && Date.now() - new Date(recent.created_at).getTime() < 60_000) {
    return NextResponse.json({ sent: false, rate_limited: true });
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error } = await admin
    .from("email_verifications")
    .insert({ user_id: user.id, token, expires_at: expiresAt });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify-email/${token}`;
  const { sent, error: sendError } = await sendEmail({
    to: user.email,
    subject: "Confirm your email — WealthView Duo",
    html: verificationEmailHtml({ fullName: profile?.full_name ?? "there", verifyUrl }),
  });

  return NextResponse.json({ sent, error: sendError });
}
