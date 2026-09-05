"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Supabase's password-reset link lands here having already exchanged
    // itself for a "recovery" session via the auth client's own detection
    // of the URL fragment — just confirm a session actually exists before
    // letting the form render, since a stale/reused link leaves none.
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setReady(!!data.session));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }

    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw new Error(updateError.message);
      setDone(true);
      setTimeout(() => router.push("/dashboard"), 2000);
    } catch (err: unknown) {
      setError((err as Error)?.message ?? "Failed to reset password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-warm-50 via-white to-brand-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <img src="/logo.svg" alt="WealthView Duo" height={36} style={{ height: 36, width: "auto" }} />
          </Link>
          <h1 className="mt-6 text-2xl font-bold text-gray-900">Set a new password</h1>
        </div>

        <div className="card shadow-card-lg">
          {done ? (
            <div className="text-center">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-sm text-gray-600">Password updated — taking you to your dashboard…</p>
            </div>
          ) : !ready ? (
            <div className="text-center">
              <p className="text-sm text-gray-500 mb-4">
                This reset link is invalid or has expired.
              </p>
              <Link href="/forgot-password" className="btn-secondary inline-flex">Request a new link</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">New password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="input"
                  required
                  minLength={8}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm new password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat password"
                  className="input"
                  required
                />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? "Saving…" : "Save new password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
