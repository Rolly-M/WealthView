"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { householdsApi } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";

function InviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<{ email?: string; households?: { name?: string } } | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [form, setForm] = useState({ full_name: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(true);

  useEffect(() => {
    householdsApi
      .previewInvite(token)
      .then((r) => setPreview(r.data as { email?: string; households?: { name?: string } }))
      .catch(() => setPreviewError(true))
      .finally(() => setPreviewLoading(false));
  }, [token]);

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) { setError("Passwords don't match"); return; }
    if (form.password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (!preview?.email) return;

    setLoading(true);
    setError("");
    try {
      const supabase = createClient();

      // Create Supabase account
      const { error: signUpError } = await supabase.auth.signUp({
        email: preview.email,
        password: form.password,
        options: { data: { full_name: form.full_name } },
      });
      if (signUpError) throw new Error(signUpError.message);

      // Accept the household invite
      await fetch(`/api/households/invite/${token}`, { method: "POST" });

      router.push("/dashboard");
    } catch (err: unknown) {
      setError((err as Error)?.message ?? "Failed to accept invitation");
    } finally {
      setLoading(false);
    }
  }

  if (previewLoading) return <div className="card shadow-card-lg h-64 shimmer" />;

  if (previewError || !preview) {
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
        <h2 className="text-base font-semibold text-gray-900">You&apos;ve been invited!</h2>
        <p className="text-sm text-gray-500 mt-1">
          Join <strong>{preview.households?.name ?? "your household"}</strong> on WealthView Duo.
        </p>
        <p className="text-xs text-brand-700 font-medium mt-2">{preview.email}</p>
      </div>

      <form onSubmit={handleAccept} className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Your name</label>
          <input type="text" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Jordan Johnson" className="input" required autoFocus />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Create a password</label>
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Minimum 8 characters" className="input" required minLength={8} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm password</label>
          <input type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} placeholder="Repeat password" className="input" required />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
          {loading ? "Joining…" : "Join household"}
        </button>
      </form>

      <p className="mt-4 text-xs text-gray-400 text-center leading-relaxed">
        You&apos;ll have your own separate login. Your partner controls what is shared with you.
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
            <img src="/logo.svg" alt="WealthView Duo" height={36} style={{ height: 36, width: "auto" }} />
          </Link>
          <h1 className="mt-6 text-2xl font-bold text-gray-900">Accept your invitation</h1>
          <p className="mt-2 text-sm text-gray-500">Create your account to join the household</p>
        </div>
        <Suspense fallback={<div className="card shadow-card-lg h-64 shimmer" />}>
          <InvitePageInner />
        </Suspense>
      </div>
    </div>
  );
}
