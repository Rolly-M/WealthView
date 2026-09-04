"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

export default function VerifyEmailPage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<"loading" | "verified" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/verify-email/${token}`, { method: "POST" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body.error ?? "Verification failed");
          setStatus("error");
          return;
        }
        setStatus("verified");
      })
      .catch(() => {
        setError("Network error — could not reach the server");
        setStatus("error");
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-warm-50 via-white to-brand-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <img src="/logo.svg" alt="WealthView Duo" height={36} style={{ height: 36, width: "auto" }} />
          </Link>
        </div>

        <div className="card shadow-card-lg text-center">
          {status === "loading" && (
            <>
              <div className="h-16 shimmer rounded-xl mb-4" />
              <p className="text-sm text-gray-500">Confirming your email…</p>
            </>
          )}

          {status === "verified" && (
            <>
              <div className="text-5xl mb-4">✅</div>
              <h1 className="text-xl font-bold text-gray-900 mb-2">Email confirmed</h1>
              <p className="text-sm text-gray-500 mb-4">Your WealthView Duo account is fully activated.</p>
              <Link href="/dashboard" className="btn-primary inline-flex">
                Go to dashboard
              </Link>
            </>
          )}

          {status === "error" && (
            <>
              <div className="text-4xl mb-4">😕</div>
              <h1 className="text-xl font-bold text-gray-900 mb-2">Couldn&apos;t confirm your email</h1>
              <p className="text-sm text-gray-500 mb-4">{error}</p>
              <Link href="/dashboard" className="btn-secondary inline-flex">
                Go to dashboard
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
