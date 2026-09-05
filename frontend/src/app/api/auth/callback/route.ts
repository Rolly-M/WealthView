import { createClient } from "@/lib/supabase/server";
import { getOrCreateHouseholdId } from "@/lib/supabase/household";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  const inviteToken = searchParams.get("invite_token");

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Signing up via the invite-accept page's Google button — join the
      // specific household the invite is for, instead of the generic
      // first-time-OAuth-user path below auto-creating a brand new one.
      if (inviteToken) {
        const { data: invite } = await supabase
          .from("invitations")
          .select("*")
          .eq("token", inviteToken)
          .single();

        const valid =
          invite &&
          invite.status === "pending" &&
          new Date(invite.expires_at) >= new Date() &&
          invite.email.toLowerCase() === data.user.email?.toLowerCase();

        if (valid) {
          await supabase
            .from("household_members")
            .insert({ household_id: invite.household_id, user_id: data.user.id, role: invite.role });
          await supabase
            .from("invitations")
            .update({ status: "accepted", accepted_at: new Date().toISOString() })
            .eq("id", invite.id);

          // MFA is mandatory on invite-accept accounts, matching the
          // email/password invite path.
          return NextResponse.redirect(`${origin}/mfa-setup`);
        }
        // Invalid/expired/mismatched invite — fall through to the normal
        // first-time-user path below rather than leaving the account in no
        // household at all.
      }

      // Auto-create a household for first-time OAuth users
      await getOrCreateHouseholdId(supabase, data.user.id);

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
