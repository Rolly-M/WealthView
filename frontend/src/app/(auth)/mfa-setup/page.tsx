"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function MfaSetupPage() {
  const router = useRouter();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    async function init() {
      const supabase = createClient();

      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      if (factorsData?.totp.some((f) => f.status === "verified")) {
        router.replace("/dashboard");
        return;
      }

      // Clean up any abandoned unverified factors from a previous attempt
      // so we always show a fresh, correctly-scanned QR code.
      for (const f of factorsData?.totp.filter((f) => f.status !== "verified") ?? []) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (enrollError) {
        setError(enrollError.message);
        setLoading(false);
        return;
      }

      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
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

    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-warm-50 via-white to-brand-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <img src="/logo.svg" alt="WealthView Duo" height={36} style={{ height: 36, width: "auto" }} />
          </Link>
          <h1 className="mt-6 text-2xl font-bold text-gray-900">Secure your account</h1>
          <p className="mt-2 text-sm text-gray-500">
            Two-factor authentication is required — set it up to continue
          </p>
        </div>

        <div className="card shadow-card-lg">
          {loading ? (
            <div className="h-64 shimmer rounded-xl" />
          ) : (
            <div className="space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
              )}

              {qrCode && (
                <div className="flex flex-col items-center gap-2 p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-sm text-gray-600 mb-1">
                    Scan with an authenticator app (Google Authenticator, Authy, 1Password, etc.)
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element -- data: URI SVG from Supabase, not an optimizable asset */}
                  <img src={qrCode} alt="Scan with your authenticator app" width={180} height={180} />
                  <p className="text-[11px] text-gray-400 text-center mt-1">
                    Can&apos;t scan? Enter this code manually:
                    <br />
                    <code className="text-gray-600 break-all">{secret}</code>
                  </p>
                </div>
              )}

              <form onSubmit={verify} className="space-y-4">
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
                <button type="submit" disabled={verifying || !factorId} className="btn-primary w-full">
                  {verifying ? "Verifying…" : "Verify and continue"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
