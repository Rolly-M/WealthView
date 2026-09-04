import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, verificationEmailHtml } from "@/lib/email";

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email_verified")
    .eq("id", user.id)
    .single();

  if (profile?.email_verified) {
    return NextResponse.json({ sent: false, already_verified: true });
  }

  const admin = createAdminClient();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error } = await admin
    .from("email_verifications")
    .insert({ user_id: user.id, token, expires_at: expiresAt });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify-email/${token}`;
  const { sent } = await sendEmail({
    to: user.email,
    subject: "Confirm your email — WealthView Duo",
    html: verificationEmailHtml({ fullName: profile?.full_name ?? "there", verifyUrl }),
  });

  return NextResponse.json({ sent });
}
