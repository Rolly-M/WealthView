import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return NextResponse.json({
    id: user.id,
    email: user.email,
    full_name: profile?.full_name ?? "",
    avatar_url: profile?.avatar_url ?? null,
    currency: profile?.currency ?? "USD",
    locale: profile?.locale ?? "en-US",
    is_verified: !!user.email_confirmed_at,
    created_at: user.created_at,
  });
}

export async function PATCH(req: Request) {
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const allowed = ["full_name", "avatar_url", "currency", "locale"];
  const updates = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

  const { data, error: updateError } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id)
    .select()
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
  return NextResponse.json({ ...data, email: user.email });
}

export async function DELETE() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Find the user's household membership
  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id, role")
    .eq("user_id", user.id)
    .single();

  if (membership) {
    // Check how many members are in the household
    const { data: allMembers } = await supabase
      .from("household_members")
      .select("id")
      .eq("household_id", membership.household_id);

    if (allMembers && allMembers.length <= 1) {
      // Only member — delete the entire household (cascades to accounts, transactions, budgets, goals)
      await supabase
        .from("households")
        .delete()
        .eq("id", membership.household_id);
    } else {
      // Remove only this user's membership
      await supabase
        .from("household_members")
        .delete()
        .eq("user_id", user.id);
    }
  }

  // Delete the Supabase auth user — cascades to profiles via DB trigger
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return new NextResponse(null, { status: 204 });
}
