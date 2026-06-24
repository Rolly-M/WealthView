import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Auto-create a household for first-time OAuth users
      const { data: membership } = await supabase
        .from("household_members")
        .select("household_id")
        .eq("user_id", data.user.id)
        .single();

      if (!membership) {
        const name = data.user.user_metadata?.full_name ?? data.user.email?.split("@")[0] ?? "My";
        const { data: household } = await supabase
          .from("households")
          .insert({ name: `${name}'s Household` })
          .select()
          .single();

        if (household) {
          await supabase
            .from("household_members")
            .insert({ household_id: household.id, user_id: data.user.id, role: "owner" });
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
