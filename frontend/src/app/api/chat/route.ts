import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

  const { message, thread_id } = await req.json();
  if (!message?.trim()) return NextResponse.json({ error: "Message required" }, { status: 400 });

  const hid = membership.household_id;

  // Fetch financial context in parallel
  const [accountsRes, txnRes, budgetsRes, goalsRes] = await Promise.all([
    supabase.from("accounts").select("name, type, current_balance, currency").eq("household_id", hid).eq("is_active", true),
    supabase.from("transactions").select("date, merchant_name, description, amount, category, is_income").eq("household_id", hid).eq("is_hidden", false).order("date", { ascending: false }).limit(60),
    supabase.from("budgets").select("name, total_amount, budget_categories(category, amount)").eq("household_id", hid).eq("is_active", true),
    supabase.from("goals").select("name, type, target_amount, current_amount, status").eq("household_id", hid).eq("status", "active"),
  ]);

  const systemPrompt = buildContext(
    accountsRes.data ?? [],
    txnRes.data ?? [],
    budgetsRes.data ?? [],
    goalsRes.data ?? []
  );

  // Get or create thread
  let threadId = thread_id;
  if (!threadId) {
    const { data: newThread } = await supabase
      .from("chat_threads")
      .insert({ household_id: hid, user_id: user.id, title: message.slice(0, 60) })
      .select()
      .single();
    threadId = newThread?.id;
  }

  // Fetch prior messages for this thread (last 10 turns = 20 messages)
  const { data: priorMsgs } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(20);

  const history = (priorMsgs ?? []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Call Claude
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [...history, { role: "user", content: message }],
  });

  const rawContent = response.content[0].type === "text" ? response.content[0].text : "";

  // Extract optional followup suggestions (Claude is asked to append them)
  const followupMatch = rawContent.match(/FOLLOWUPS:\s*(\[[\s\S]*?\])/);
  let suggested_followups: string[] = [];
  let content = rawContent;

  if (followupMatch) {
    try {
      suggested_followups = JSON.parse(followupMatch[1]);
      content = rawContent.replace(followupMatch[0], "").trim();
    } catch { /* ignore parse failure */ }
  }

  // Persist both messages
  const now = new Date().toISOString();
  await supabase.from("chat_messages").insert([
    { thread_id: threadId, role: "user", content: message, suggested_followups: [], created_at: now },
    { thread_id: threadId, role: "assistant", content, suggested_followups, created_at: new Date(Date.now() + 1).toISOString() },
  ]);

  // Update thread updated_at
  await supabase.from("chat_threads").update({ updated_at: now }).eq("id", threadId);

  const assistantMessage = {
    id: `msg-${Date.now()}`,
    role: "assistant",
    content,
    suggested_followups,
    sources: [],
    created_at: now,
  };

  return NextResponse.json({ thread_id: threadId, message: assistantMessage });
}

function buildContext(
  accounts: Array<{ name: string; type: string; current_balance: number; currency: string }>,
  transactions: Array<{ date: string; merchant_name: string | null; description: string; amount: number; category: string; is_income: boolean }>,
  budgets: Array<{ name: string; total_amount: number; budget_categories: Array<{ category: string; amount: number }> }>,
  goals: Array<{ name: string; type: string; target_amount: number; current_amount: number; status: string }>
): string {
  let totalAssets = 0, totalLiabilities = 0;
  const accountLines = accounts.map((a) => {
    const bal = Number(a.current_balance);
    if (a.type === "credit" || a.type === "loan") totalLiabilities += Math.abs(bal);
    else totalAssets += bal;
    return `  - ${a.name} (${a.type}): $${bal.toFixed(2)}`;
  });

  const txnLines = transactions.slice(0, 30).map((t) =>
    `  - ${t.date}: ${t.merchant_name ?? t.description} — $${Math.abs(Number(t.amount)).toFixed(2)} [${t.category}]${t.is_income ? " (income)" : ""}`
  );

  const budgetLines = budgets.map((b) =>
    `  - ${b.name}: $${Number(b.total_amount).toFixed(2)}/mo total`
  );

  const goalLines = goals.map((g) => {
    const pct = Number(g.target_amount) > 0
      ? ((Number(g.current_amount) / Number(g.target_amount)) * 100).toFixed(1)
      : "0";
    return `  - ${g.name} (${g.type}): $${Number(g.current_amount).toFixed(2)} / $${Number(g.target_amount).toFixed(2)} (${pct}%)`;
  });

  return `You are a knowledgeable personal finance assistant for a couple using WealthView Duo.
You have access to their real financial data below. Be concise, specific, and actionable.
Always reference actual numbers from their data. Don't make up figures.

ACCOUNTS:
${accountLines.join("\n") || "  No accounts linked yet."}

NET WORTH: $${(totalAssets - totalLiabilities).toFixed(2)} (Assets: $${totalAssets.toFixed(2)}, Liabilities: $${totalLiabilities.toFixed(2)})

RECENT TRANSACTIONS (last 30):
${txnLines.join("\n") || "  No transactions yet."}

ACTIVE BUDGETS:
${budgetLines.join("\n") || "  No budgets set."}

ACTIVE GOALS:
${goalLines.join("\n") || "  No goals set."}

After your answer, optionally append suggested follow-up questions in this exact format on the last line:
FOLLOWUPS: ["question 1?", "question 2?", "question 3?"]`;
}
