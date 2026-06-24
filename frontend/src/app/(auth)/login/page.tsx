"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authApi, usersApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { setAuth, isAuthenticated } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) router.replace("/dashboard");
    if (params.get("demo") === "true") {
      setEmail("alex@demo.wealthviewduo.com");
      setPassword("demo1234!");
    }
  }, [isAuthenticated, params, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await authApi.login(email, password);
      const { access_token, refresh_token } = res.data;
      localStorage.setItem("access_token", access_token);
      localStorage.setItem("refresh_token", refresh_token);
      const userRes = await usersApi.me();
      setAuth(userRes.data, access_token, refresh_token);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "Login failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card shadow-card-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="input"
            required
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="input"
            required
          />
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="mt-6 pt-6 border-t border-gray-100 text-center">
        <p className="text-sm text-gray-500">
          Don't have an account?{" "}
          <Link href="/register" className="text-brand-600 font-medium hover:underline">
            Create one
          </Link>
        </p>
      </div>

      <div className="mt-4 p-4 rounded-xl bg-brand-50 border border-brand-100">
        <p className="text-xs font-semibold text-brand-700 mb-2">Demo mode quick-login:</p>
        <button
          type="button"
          onClick={() => { setEmail("alex@demo.wealthviewduo.com"); setPassword("demo1234!"); }}
          className="text-xs text-brand-600 hover:underline block"
        >
          Alex (Owner) — alex@demo.wealthviewduo.com / demo1234!
        </button>
        <button
          type="button"
          onClick={() => { setEmail("jordan@demo.wealthviewduo.com"); setPassword("demo1234!"); }}
          className="text-xs text-brand-600 hover:underline block mt-1"
        >
          Jordan (Partner) — jordan@demo.wealthviewduo.com / demo1234!
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-warm-50 via-white to-brand-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <span className="text-2xl font-bold text-brand-700">WealthView</span>
            <span className="text-sm font-semibold text-brand-500 bg-brand-50 px-2 py-0.5 rounded-full ml-1">Duo</span>
          </Link>
          <h1 className="mt-6 text-2xl font-bold text-gray-900">Welcome back</h1>
          <p className="mt-2 text-sm text-gray-500">Sign in to your household account</p>
        </div>

        {/* Suspense required because LoginForm uses useSearchParams() */}
        <Suspense fallback={<div className="card shadow-card-lg h-64 shimmer" />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
