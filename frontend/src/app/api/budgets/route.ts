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
    .from("budgets")
    .select("*, categories:budget_categories(*)")
    .eq("household_id", membership.household_id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? []);
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
  const { categories, ...budgetData } = body;

  const { data: budget, error } = await supabase
    .from("budgets")
    .insert({
      household_id: membership.household_id,
      created_by_id: user.id,
      name: budgetData.name,
      period: budgetData.period ?? "monthly",
      month: budgetData.month,
      year: budgetData.year,
      total_amount: budgetData.total_amount,
      rollover: budgetData.rollover ?? false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (Array.isArray(categories) && categories.length > 0) {
    await supabase.from("budget_categories").insert(
      categories.map((c: { category: string; amount: number; rollover?: boolean }) => ({
        budget_id: budget.id,
        category: c.category,
        amount: c.amount,
        rollover: c.rollover ?? false,
      }))
    );
  }

  const { data: full } = await supabase
    .from("budgets")
    .select("*, categories:budget_categories(*)")
    .eq("id", budget.id)
    .single();

  return NextResponse.json(full, { status: 201 });
}
