"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/stores/authStore";

export default function MfaChallengePage() {
  const router = useRouter();
  const { setUser } = useAuthStore();
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    async function init() {
      const supabase = createClient();

      // No aal1 session at all (e.g. direct navigation, or already at aal2) —
      // nothing to challenge here.
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!aal || aal.currentLevel !== "aal1" || aal.nextLevel !== "aal2") {
        router.replace(aal ? "/dashboard" : "/login");
        return;
      }

      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
      const factor = factorsData?.totp.find((f) => f.status === "verified");
      if (factorsError || !factor) {
        setError("No authenticator app is set up on this account.");
        setLoading(false);
        return;
      }

      setFactorId(factor.id);
      setLoading(false);
    }
    init();
  }, [router]);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setVerifying(true);
    setError("");

    const supabase = createClient();
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) {
      setError(challengeError.message);
      setVerifying(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });
    if (verifyError) {
      setError(verifyError.message);
      setVerifying(false);
      return;
    }

    const res = await fetch("/api/profile");
    if (res.ok) setUser(await res.json());
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-warm-50 via-white to-brand-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <img src="/logo.svg" alt="WealthView Duo" height={36} style={{ height: 36, width: "auto" }} />
          </Link>
          <h1 className="mt-6 text-2xl font-bold text-gray-900">Two-factor verification</h1>
          <p className="mt-2 text-sm text-gray-500">Enter the code from your authenticator app</p>
        </div>

        <div className="card shadow-card-lg">
          {loading ? (
            <div className="h-24 shimmer rounded-xl" />
          ) : (
            <form onSubmit={verify} className="space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">6-digit code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="000000"
                  className="input text-center tracking-[0.3em] text-lg"
                  required
                  autoFocus
                  disabled={!factorId}
                />
              </div>
              <button type="submit" disabled={verifying || !factorId} className="btn-primary w-full mt-2">
                {verifying ? "Verifying…" : "Verify"}
              </button>
            </form>
          )}

          <div className="mt-6 pt-6 border-t border-gray-100 text-center">
            <p className="text-sm text-gray-500">
              <Link href="/login" className="text-brand-600 font-medium hover:underline">
                Back to sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
