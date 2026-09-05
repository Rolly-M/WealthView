"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { householdsApi } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";

function InviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<{ email?: string; household_name?: string } | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string | null | undefined>(undefined); // undefined = still checking

  useEffect(() => {
    householdsApi
      .previewInvite(token)
      .then((r) => setPreview(r.data as { email?: string; household_name?: string }))
      .catch(() => setPreviewError(true))
      .finally(() => setPreviewLoading(false));
  }, [token]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setSessionEmail(data.session?.user.email ?? null));
  }, []);

  async function acceptAsLoggedInUser() {
    setLoading(true);
    setError("");
    try {
      const acceptRes = await fetch(`/api/households/invite/${token}`, { method: "POST" });
      if (!acceptRes.ok) {
        const body = await acceptRes.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to join household");
      }
      router.push("/dashboard");
    } catch (err: unknown) {
      setError((err as Error)?.message ?? "Failed to accept invitation");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      // /api/auth/callback accepts this specific invite (instead of its
      // usual first-time-OAuth-user auto-create-household path) once the
      // OAuth round trip completes.
      options: { redirectTo: `${window.location.origin}/api/auth/callback?invite_token=${token}` },
    });
  }

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) { setError("Passwords don't match"); return; }
    if (form.password.length < 8) { setError("Password must be at least 8 characters"); return; }

    setLoading(true);
    setError("");
    try {
      const supabase = createClient();

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { full_name: form.full_name } },
      });

      let session = signUpData.session;

      if (signUpError) {
        if (!signUpError.message.toLowerCase().includes("already registered")) {
          throw new Error(signUpError.message);
        }
        // An account for this email already exists — most likely from an
        // earlier attempt at this same invite (e.g. one that got stuck on
        // Supabase's own email confirmation before it was accepted). Try
        // signing in with what was just typed instead of dead-ending on
        // Supabase's generic "already registered" error.
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        });
        if (signInError) {
          throw new Error(
            "An account already exists for this email. Try logging in with its password instead, or use \"Forgot password\" on the login page."
          );
        }
        session = signInData.session;
      } else {
        // Fire-and-forget our own branded verification email either way —
        // it works even when Supabase's own "Confirm email" is on and
        // withheld the session, since we pass the id signUp() just gave us.
        fetch("/api/auth/send-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: signUpData.user?.id }),
        }).catch(() => {});
      }

      if (!session) {
        // Email confirmation required — no session yet, so the invite can't
        // be accepted until the user confirms and comes back to this link.
        setNeedsConfirmation(true);
        return;
      }

      // Accept the household invite
      const acceptRes = await fetch(`/api/households/invite/${token}`, { method: "POST" });
      if (!acceptRes.ok) {
        const body = await acceptRes.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to join household");
      }

      // MFA is mandatory on password-created accounts — flag it, then send
      // straight to enrollment.
      await fetch("/api/auth/require-mfa", { method: "POST" });
      router.push("/mfa-setup");
    } catch (err: unknown) {
      setError((err as Error)?.message ?? "Failed to accept invitation");
    } finally {
      setLoading(false);
    }
  }

  if (previewLoading) return <div className="card shadow-card-lg h-64 shimmer" />;

  if (needsConfirmation) {
    return (
      <div className="card max-w-md w-full text-center">
        <div className="text-5xl mb-4">📬</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Check your email</h1>
        <p className="text-sm text-gray-500 mb-4">
          We sent a confirmation link to <strong>{form.email}</strong>. Click it to
          activate your account, then come back to this invite link to finish joining.
        </p>
        <Link href="/login" className="btn-secondary">Go to login</Link>
      </div>
    );
  }

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

  // Already logged in (e.g. came back after logging in with an account
  // created by an earlier attempt at this same invite) — just accept it
  // directly instead of routing through the signup/signin form at all.
  // The server still enforces a match for the older invite style that
  // does address a specific email — its error surfaces here as-is.
  if (sessionEmail !== undefined && sessionEmail !== null) {
    return (
      <div className="card shadow-card-lg text-center">
        <div className="text-3xl mb-2">🤝</div>
        <h2 className="text-base font-semibold text-gray-900 mb-1">
          Join {preview.household_name ?? "the household"}?
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          You&apos;re logged in as <strong>{sessionEmail}</strong>.
        </p>
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm mb-4 text-left">{error}</div>
        )}
        <button onClick={acceptAsLoggedInUser} disabled={loading} className="btn-primary w-full">
          {loading ? "Joining…" : "Accept invitation"}
        </button>
        <button
          onClick={async () => { await createClient().auth.signOut(); location.reload(); }}
          className="mt-2 text-xs text-gray-400 hover:underline"
        >
          Not you? Log out
        </button>
      </div>
    );
  }

  return (
    <div className="card shadow-card-lg">
      <div className="mb-5 p-4 rounded-2xl bg-brand-50 border border-brand-200 text-center">
        <div className="text-3xl mb-2">🤝</div>
        <h2 className="text-base font-semibold text-gray-900">You&apos;ve been invited!</h2>
        <p className="text-sm text-gray-500 mt-1">
          Join <strong>{preview.household_name ?? "your household"}</strong> on WealthView Duo.
        </p>
        {preview.email && (
          <p className="text-xs text-brand-700 font-medium mt-2">{preview.email}</p>
        )}
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-all mb-4"
      >
        <GoogleIcon />
        Continue with Google
      </button>

      <div className="relative mb-4">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100" /></div>
        <div className="relative flex justify-center">
          <span className="bg-white px-3 text-xs text-gray-400">or join with email</span>
        </div>
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
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Your email</label>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jordan@example.com" className="input" required />
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
      <p className="mt-2 text-xs text-gray-400 text-center">
        Already have an account? <Link href="/login" className="text-brand-600 hover:underline">Log in</Link>, then open this invite link again.
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

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}
