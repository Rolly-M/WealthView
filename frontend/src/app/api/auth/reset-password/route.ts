import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { token, password } = await request.json().catch(() => ({}));
  if (typeof token !== "string" || !token || typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: reset } = await admin
    .from("password_resets")
    .select("*")
    .eq("token", token)
    .single();

  if (!reset) return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 404 });
  if (reset.used_at) return NextResponse.json({ error: "This reset link has already been used" }, { status: 410 });
  if (new Date(reset.expires_at) < new Date()) {
    return NextResponse.json({ error: "This reset link has expired" }, { status: 410 });
  }

  // Service-role update — works without the visitor ever having a session,
  // which is the whole point of a "forgot" password flow.
  const { error: updateError } = await admin.auth.admin.updateUserById(reset.user_id, { password });
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await admin.from("password_resets").update({ used_at: new Date().toISOString() }).eq("id", reset.id);

  return NextResponse.json({ success: true });
}
