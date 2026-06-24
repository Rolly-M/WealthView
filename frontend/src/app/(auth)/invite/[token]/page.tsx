"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { householdsApi, usersApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function InviteForm({ token }: { token: string }) {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [preview, setPreview] = useState<any>(null);
  const [form, setForm] = useState({ full_name: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(true);

  useEffect(() => {
    householdsApi
      .previewInvite(token)
      .then((r) => setPreview(r.data))
      .catch(() => setPreview({ valid: false }))
      .finally(() => setPreviewLoading(false));
  }, [token]);

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError("Passwords don't match");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/invite/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: form.password, full_name: form.full_name }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail ?? "Failed to accept invite");
      }
      const data = await res.json();
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      const userRes = await usersApi.me();
      setAuth(userRes.data, data.access_token, data.refresh_token);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message ?? "Failed to accept invitation");
    } finally {
      setLoading(false);
    }
  }

  if (previewLoading) {
    return <div className="card shadow-card-lg h-64 shimmer" />;
  }

  if (!preview?.valid) {
    return (
      <div className="card max-w-md w-full text-center">
        <div className="text-4xl mb-4">😕</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Invitation expired or invalid</h1>
        <p className="text-sm text-gray-500 mb-4">
          This invite link is no longer valid. Ask your partner to send a new one.
        </p>
        <Link href="/login" className="btn-secondary">Go to login</Link>
      </div>
    );
  }

  return (
    <div className="card shadow-card-lg">
      <div className="mb-5 p-4 rounded-2xl bg-brand-50 border border-brand-200 text-center">
        <div className="text-3xl mb-2">🤝</div>
        <h2 className="text-base font-semibold text-gray-900">You've been invited!</h2>
        <p className="text-sm text-gray-500 mt-1">
          Join your household on WealthView Duo.
        </p>
        <p className="text-xs text-brand-700 font-medium mt-2">{preview.email}</p>
      </div>

      <form onSubmit={handleAccept} className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Your name</label>
          <input
            type="text"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            placeholder="Jordan Johnson"
            className="input"
            required
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Create a password</label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="Minimum 8 characters"
            className="input"
            required
            minLength={8}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm password</label>
          <input
            type="password"
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            placeholder="Repeat password"
            className="input"
            required
          />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
          {loading ? "Joining…" : "Join household"}
        </button>
      </form>

      <p className="mt-4 text-xs text-gray-400 text-center leading-relaxed">
        You'll have your own separate login. Your partner controls what is shared with you.
      </p>
    </div>
  );
}

function InvitePageInner() {
  const { token } = useParams<{ token: string }>();
  return <InviteForm token={token} />;
}

export default function InviteAcceptPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-warm-50 via-white to-brand-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <span className="text-2xl font-bold text-brand-700">WealthView</span>
            <span className="text-sm font-semibold text-brand-500 bg-brand-50 px-2 py-0.5 rounded-full ml-1">Duo</span>
          </Link>
          <h1 className="mt-6 text-2xl font-bold text-gray-900">Accept your invitation</h1>
          <p className="mt-2 text-sm text-gray-500">Create your account to join the household</p>
        </div>

        {/* Suspense required: useParams is a dynamic hook */}
        <Suspense fallback={<div className="card shadow-card-lg h-64 shimmer" />}>
          <InvitePageInner />
        </Suspense>
      </div>
    </div>
  );
}
