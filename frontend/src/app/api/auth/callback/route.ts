import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
      // Uses the admin client (bypasses RLS) rather than the just-minted
      // user-scoped session — the invitations SELECT policy depends on the
      // JWT's email claim being visible to Postgres at query time, which
      // isn't guaranteed to have propagated yet immediately after
      // exchangeCodeForSession in the same request. When that SELECT
      // silently returned no row, `valid` was always false and this fell
      // through to auto-creating a brand new household instead of joining
      // the invited one — every single time, not intermittently.
      if (inviteToken) {
        const admin = createAdminClient();
        const { data: invite } = await admin
          .from("invitations")
          .select("*")
          .eq("token", inviteToken)
          .single();

        const valid =
          invite &&
          invite.status === "pending" &&
          new Date(invite.expires_at) >= new Date() &&
          (!invite.email || invite.email.toLowerCase() === data.user.email?.toLowerCase());

        if (valid) {
          // Atomic claim — conditioning the update on status still being
          // "pending" makes Postgres the arbiter for concurrent accepts
          // (e.g. this callback racing the email/password accept path for
          // the same token) instead of both passing an earlier read-only
          // status check before either had written "accepted".
          const { data: claimed } = await admin
            .from("invitations")
            .update({ status: "accepted", accepted_at: new Date().toISOString() })
            .eq("id", invite.id)
            .eq("status", "pending")
            .select()
            .single();

          if (claimed) {
            const { error: insertError } = await admin
              .from("household_members")
              .insert({ household_id: invite.household_id, user_id: data.user.id, role: invite.role });

            if (!insertError) {
              // MFA is mandatory on invite-accept accounts, matching the
              // email/password invite path.
              return NextResponse.redirect(`${origin}/mfa-setup`);
            }
            // Give the invite back rather than burning it on an unrelated
            // failure (e.g. this user is already a member of some household).
            await admin.from("invitations").update({ status: "pending", accepted_at: null }).eq("id", invite.id);
          }
        }
        // Invalid/expired/mismatched invite — still give the account a
        // household so it isn't left in a broken state, but flag it
        // instead of silently doing the wrong thing.
        await getOrCreateHouseholdId(supabase, data.user.id);
        return NextResponse.redirect(`${origin}/dashboard?error=invite_invalid`);
      }

      // Auto-create a household for first-time OAuth users
      await getOrCreateHouseholdId(supabase, data.user.id);

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
