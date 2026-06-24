"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Plus, MessageSquare, Sparkles } from "lucide-react";
import { chatApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";
import type { ChatThread, ChatMessage } from "@/types";

const SUGGESTED_PROMPTS = [
  "What did we spend the most on this month?",
  "How much did we save in the last 90 days?",
  "Which subscriptions should we cancel?",
  "What were our biggest transactions last month?",
  "How much cash do we have available after bills?",
  "What category increased the most this quarter?",
];

export default function ChatPage() {
  const { user } = useAuthStore();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThread, setActiveThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadThreads();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadThreads() {
    setLoadingThreads(true);
    try {
      const res = await chatApi.threads();
      setThreads(res.data);
    } finally {
      setLoadingThreads(false);
    }
  }

  async function openThread(thread: ChatThread) {
    const res = await chatApi.thread(thread.id);
    setActiveThread(res.data);
    setMessages(res.data.messages ?? []);
  }

  async function newThread() {
    setActiveThread(null);
    setMessages([]);
  }

  async function send(text?: string) {
    const msg = text ?? input.trim();
    if (!msg || sending) return;
    setInput("");
    setSending(true);

    // Optimistic user message
    const tempMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: msg,
      sources: [],
      suggested_followups: [],
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      const res = await chatApi.sendMessage(msg, activeThread?.id);
      const { thread_id, message } = res.data;

      if (!activeThread) {
        const threadRes = await chatApi.thread(thread_id);
        setActiveThread(threadRes.data);
        setThreads((prev) => [threadRes.data, ...prev]);
      }

      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempMsg.id),
        message,
      ]);
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
    } finally {
      setSending(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const initials = user?.full_name.slice(0, 2).toUpperCase() ?? "U";

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6 animate-slide-in">
      {/* Thread sidebar */}
      <div className="w-72 flex flex-col gap-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Conversations</h2>
          <button onClick={newThread} className="btn-secondary py-1.5 px-2.5 text-xs">
            <Plus size={13} /> New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5">
          {loadingThreads ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="shimmer h-14 rounded-xl" />
            ))
          ) : threads.length === 0 ? (
            <div className="text-center text-gray-400 text-xs py-8">No conversations yet</div>
          ) : (
            threads.map((t) => (
              <button
                key={t.id}
                onClick={() => openThread(t)}
                className={cn(
                  "w-full text-left p-3 rounded-xl border transition-all",
                  activeThread?.id === t.id
                    ? "bg-brand-50 border-brand-200 text-brand-800"
                    : "bg-white border-gray-100 hover:border-gray-200 text-gray-700"
                )}
              >
                <div className="flex items-center gap-2">
                  <MessageSquare size={13} className="flex-shrink-0" />
                  <p className="text-xs font-medium truncate">{t.title ?? "Conversation"}</p>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  {new Date(t.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 card p-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
          <Sparkles size={16} className="text-brand-600" />
          <span className="font-semibold text-sm text-gray-900">Finance Chat</span>
          <span className="text-xs text-gray-400 ml-auto">
            Ask about your spending, savings, goals, or subscriptions
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className="text-5xl">💬</div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Ask me anything</h3>
                <p className="text-sm text-gray-500 max-w-sm">
                  I have full access to your transaction history, budgets, and account balances.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 max-w-lg w-full">
                {SUGGESTED_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => send(p)}
                    className="p-3 rounded-xl border border-gray-200 text-xs text-gray-600 text-left hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50 transition-all"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn("flex gap-3", msg.role === "user" && "justify-end")}
            >
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Sparkles size={13} className="text-brand-600" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
                  msg.role === "user"
                    ? "bg-brand-600 text-white rounded-tr-sm"
                    : "bg-gray-100 text-gray-800 rounded-tl-sm"
                )}
              >
                {msg.content}
                {msg.role === "assistant" && msg.suggested_followups?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {msg.suggested_followups.map((f) => (
                      <button
                        key={f}
                        onClick={() => send(f)}
                        className="text-[11px] px-2 py-1 rounded-lg bg-white border border-gray-200 text-gray-600 hover:border-brand-300 hover:text-brand-700 transition-all"
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {msg.role === "user" && (
                <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center flex-shrink-0 mt-0.5 text-white text-xs font-bold">
                  {initials}
                </div>
              )}
            </div>
          ))}

          {sending && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center">
                <Sparkles size={13} className="text-brand-600 animate-pulse" />
              </div>
              <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="px-5 py-4 border-t border-gray-100">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about your finances… (Enter to send)"
              rows={1}
              className="input flex-1 resize-none min-h-[42px] max-h-32"
              style={{ height: "auto" }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || sending}
              className="btn-primary px-4 flex-shrink-0"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
