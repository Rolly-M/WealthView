import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, passwordResetEmailHtml } from "@/lib/email";

export async function POST(request: Request) {
  const { email } = await request.json().catch(() => ({ email: undefined }));
  if (typeof email !== "string" || !email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Always respond identically whether or not the email matches an
  // account — this endpoint must not be usable to enumerate registered
  // emails.
  const { data: userId } = await admin.rpc("get_user_id_by_email", { p_email: email });

  if (userId) {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const { error: insertError } = await admin
      .from("password_resets")
      .insert({ user_id: userId, token, expires_at: expiresAt });

    if (!insertError) {
      const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password/${token}`;
      const { error: sendError } = await sendEmail({
        to: email,
        subject: "Reset your password — WealthView Duo",
        html: passwordResetEmailHtml({ resetUrl }),
      });
      if (sendError) console.error("Failed to send password reset email:", sendError);
    } else {
      console.error("Failed to create password reset token:", insertError.message);
    }
  }

  return NextResponse.json({ sent: true });
}
