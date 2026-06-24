import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .single();
  if (!membership) return NextResponse.json([]);

  const { data, error } = await supabase
    .from("goals")
    .select("*")
    .eq("household_id", membership.household_id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const goals = (data ?? []).map((g) => ({
    ...g,
    progress_pct: Number(g.target_amount) > 0
      ? (Number(g.current_amount) / Number(g.target_amount)) * 100
      : 0,
  }));

  return NextResponse.json(goals);
}

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .single();
  if (!membership) return NextResponse.json({ error: "No household" }, { status: 404 });

  const body = await req.json();
  const { data, error } = await supabase
    .from("goals")
    .insert({
      household_id: membership.household_id,
      created_by_id: user.id,
      name: body.name,
      description: body.description,
      type: body.type ?? "savings",
      target_amount: body.target_amount,
      current_amount: body.current_amount ?? 0,
      monthly_contribution: body.monthly_contribution,
      target_date: body.target_date,
      emoji: body.emoji,
      color: body.color,
      scope: body.scope ?? "household",
      status: "active",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ...data, progress_pct: 0 }, { status: 201 });
}
