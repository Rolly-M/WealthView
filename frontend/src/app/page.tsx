"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function LandingPage() {
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    axios.get(`${API_URL}/api/v1/demo/credentials`).then((r) => {
      setDemoMode(r.data.demo_mode);
    }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-warm-50 via-white to-brand-50">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-brand-700">WealthView</span>
          <span className="text-sm font-semibold text-brand-500 bg-brand-50 px-2 py-0.5 rounded-full">Duo</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
            Sign in
          </Link>
          <Link href="/register" className="btn-primary text-sm px-5">
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="max-w-7xl mx-auto px-8 pt-20 pb-32">
        <div className="text-center max-w-4xl mx-auto">
          {demoMode && (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-sm font-medium mb-8">
              <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse"></span>
              Demo mode active — no bank credentials required
            </div>
          )}

          <h1 className="text-5xl sm:text-7xl font-bold text-gray-900 leading-tight mb-6">
            Your money,{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-teal-500">
              together
            </span>
          </h1>
          <p className="text-xl text-gray-500 leading-relaxed mb-12 max-w-2xl mx-auto">
            WealthView Duo connects your accounts, automatically classifies spending,
            surfaces proactive insights, and gives couples a shared financial picture
            with the privacy controls you need.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
            <Link href="/register" className="btn-primary px-8 py-4 text-base rounded-2xl">
              Start for free
            </Link>
            {demoMode && (
              <Link
                href="/login?demo=true"
                className="btn-secondary px-8 py-4 text-base rounded-2xl"
              >
                Try demo →
              </Link>
            )}
          </div>

          {/* Feature grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 text-left mt-12">
            {FEATURES.map((f) => (
              <div key={f.title} className="card card-hover">
                <div className="text-3xl mb-4">{f.emoji}</div>
                <h3 className="text-base font-semibold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Demo credentials */}
        {demoMode && (
          <div className="mt-20 max-w-lg mx-auto card bg-brand-50 border-brand-200">
            <h3 className="font-semibold text-brand-800 mb-3">Demo Login Credentials</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Alex (Owner)</span>
                <code className="text-brand-700">alex@demo.wealthviewduo.com / demo1234!</code>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Jordan (Partner)</span>
                <code className="text-brand-700">jordan@demo.wealthviewduo.com / demo1234!</code>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

const FEATURES = [
  {
    emoji: "🏦",
    title: "Secure bank connections",
    desc: "Read-only bank sync with Plaid integration. Demo mode works out of the box with realistic mock data.",
  },
  {
    emoji: "🤝",
    title: "Built for couples",
    desc: "Shared household workspace with private account options. Invite your partner in seconds.",
  },
  {
    emoji: "🧠",
    title: "Auto-classification",
    desc: "Transactions are automatically categorized across 20 categories with confidence scores and explanations.",
  },
  {
    emoji: "💡",
    title: "Proactive insights",
    desc: "Spend anomalies, savings rate drops, subscription bloat, and more — surfaced automatically after each sync.",
  },
  {
    emoji: "💬",
    title: "Finance chat",
    desc: "Ask your data anything. 'What did we spend on dining?' 'How's our savings rate?' Answers in seconds.",
  },
  {
    emoji: "📊",
    title: "ETF research",
    desc: "Screen high-dividend ETFs by yield, expense ratio, sector concentration, and more. Build your watchlist.",
  },
];
