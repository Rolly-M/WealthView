import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: thread } = await supabase
    .from("chat_threads")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  const { data: messages } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("thread_id", params.id)
    .order("created_at", { ascending: true });

  return NextResponse.json({ ...thread, messages: messages ?? [] });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await supabase.from("chat_threads").delete().eq("id", params.id);
  return new NextResponse(null, { status: 204 });
}
