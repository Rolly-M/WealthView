import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Admin client throughout — this runs for an unauthenticated visitor who
// just clicked a link from an email, possibly with no session on this
// device/browser at all, so a user-scoped client isn't an option here.
export async function POST(
  _req: Request,
  { params }: { params: { token: string } }
) {
  const admin = createAdminClient();

  const { data: verification } = await admin
    .from("email_verifications")
    .select("id, user_id, expires_at, verified_at")
    .eq("token", params.token)
    .single();

  if (!verification) {
    return NextResponse.json({ error: "Invalid verification link" }, { status: 404 });
  }
  if (verification.verified_at) {
    return NextResponse.json({ verified: true, already_verified: true });
  }
  if (new Date(verification.expires_at) < new Date()) {
    return NextResponse.json({ error: "This verification link has expired" }, { status: 410 });
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ email_verified: true })
    .eq("id", verification.user_id);
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  await admin
    .from("email_verifications")
    .update({ verified_at: new Date().toISOString() })
    .eq("id", verification.id);

  return NextResponse.json({ verified: true });
}
