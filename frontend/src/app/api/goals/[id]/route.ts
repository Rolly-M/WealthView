import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const allowed = ["name", "description", "target_amount", "current_amount", "monthly_contribution", "target_date", "emoji", "color", "status"];
  const updates = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

  if (updates.status === "completed") {
    (updates as Record<string, unknown>).completed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("goals")
    .update(updates)
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
