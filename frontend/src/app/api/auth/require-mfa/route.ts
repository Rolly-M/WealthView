import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Called right after password-based signup (register + invite-accept) to
// flag the new account as requiring MFA enrollment before it can use the
// app — enforced by middleware.ts, which redirects to /mfa-setup until a
// verified TOTP factor exists.
export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("profiles")
    .update({ mfa_required: true })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
