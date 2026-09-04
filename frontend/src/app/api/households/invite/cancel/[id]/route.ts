import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id, role")
    .eq("user_id", user.id)
    .single();

  if (!membership) return NextResponse.json({ error: "No household" }, { status: 404 });
  if (membership.role !== "owner" && membership.role !== "editor") {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("invitations")
    .update({ status: "cancelled" })
    .eq("id", params.id)
    .eq("household_id", membership.household_id)
    .eq("status", "pending")
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Invitation not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
