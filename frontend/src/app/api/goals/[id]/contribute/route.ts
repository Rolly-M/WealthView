import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const amount = Number(body.amount);
  if (!amount || amount <= 0) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });

  const { data: goal } = await supabase
    .from("goals")
    .select("current_amount, target_amount")
    .eq("id", params.id)
    .single();

  if (!goal) return NextResponse.json({ error: "Goal not found" }, { status: 404 });

  const newAmount = Number(goal.current_amount) + amount;
  const isCompleted = newAmount >= Number(goal.target_amount);

  const { data, error } = await supabase
    .from("goals")
    .update({
      current_amount: newAmount,
      ...(isCompleted ? { status: "completed", completed_at: new Date().toISOString() } : {}),
    })
    .eq("id", params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({
    ...data,
    progress_pct: Number(data.target_amount) > 0
      ? (Number(data.current_amount) / Number(data.target_amount)) * 100
      : 0,
  });
}
