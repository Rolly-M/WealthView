"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Link2, UserPlus, Shield, Eye, EyeOff, RefreshCw, Building2 } from "lucide-react";
import { accountsApi, householdsApi, usersApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { formatCurrency, cn } from "@/lib/utils";
import type { Account, Household, User } from "@/types";
import { usePlaidLink } from "react-plaid-link";

// ─── Plaid Link button ────────────────────────────────────────────────────────
// Inner component — only mounted once we have a valid token
function PlaidLinkInner({
  token, onSuccess, variant,
}: {
  token: string; onSuccess: () => void; variant: "default" | "large";
}) {
  const [connecting, setConnecting] = useState(false);

  const { open, ready } = usePlaidLink({
    token,
    onSuccess: async (publicToken) => {
      setConnecting(true);
      try {
        await fetch("/api/plaid/exchange-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ public_token: publicToken }),
        });
        onSuccess();
      } finally {
        setConnecting(false);
      }
    },
  });

  return (
    <button
      onClick={() => open()}
      disabled={!ready || connecting}
      className={variant === "large" ? "btn-primary" : "btn-primary text-xs py-2"}
    >
      <Building2 size={variant === "large" ? 16 : 13} />
      {connecting ? "Connecting…" : !ready ? "Initialising…" : "Connect bank account"}
    </button>
  );
}

function PlaidLinkButton({ onSuccess, variant = "default" }: { onSuccess: () => void; variant?: "default" | "large" }) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/plaid/link-token", { method: "POST" })
      .then(async (r) => {
        const d = await r.json();
        if (d.link_token) setLinkToken(d.link_token);
        else setFetchError(d.error ?? "Failed to load Plaid Link");
      })
      .catch(() => setFetchError("Network error — could not reach /api/plaid/link-token"));
  }, []);

  if (fetchError) {
    return (
      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg max-w-xs">
        <p className="font-semibold mb-0.5">Bank connection unavailable</p>
        <p className="text-amber-600">{fetchError}</p>
      </div>
    );
  }

  if (!linkToken) {
    return (
      <button disabled className={variant === "large" ? "btn-primary opacity-60" : "btn-primary text-xs py-2 opacity-60"}>
        <Building2 size={variant === "large" ? 16 : 13} />
        Loading…
      </button>
    );
  }

  return <PlaidLinkInner token={linkToken} onSuccess={onSuccess} variant={variant} />;
}

// ─── Sync button ──────────────────────────────────────────────────────────────
function SyncButton({ onSync }: { onSync: () => void }) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState("");

  async function sync() {
    setSyncing(true);
    setResult("");
    try {
      const res = await fetch("/api/plaid/sync", { method: "POST" });
      const d = await res.json();
      setResult(`Synced ${d.synced} transactions`);
      onSync();
    } catch {
      setResult("Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {result && <span className="text-xs text-gray-400">{result}</span>}
      <button onClick={sync} disabled={syncing} className="btn-secondary text-xs py-2">
        <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
        {syncing ? "Syncing…" : "Sync now"}
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { user, setUser } = useAuthStore();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [household, setHousehold] = useState<Household | null>(null);
  const [tab, setTab] = useState<"accounts" | "household" | "profile" | "privacy">("accounts");
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteStatus, setInviteStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [acctRes, hhRes] = await Promise.allSettled([
        accountsApi.list(),
        householdsApi.mine(),
      ]);
      if (acctRes.status === "fulfilled") setAccounts(acctRes.value.data);
      if (hhRes.status === "fulfilled") setHousehold(hhRes.value.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleShared(account: Account) {
    await accountsApi.update(account.id, { is_shared: !account.is_shared });
    load();
  }

  async function disconnect(account: Account) {
    if (!confirm(`Disconnect ${account.name}?`)) return;
    await accountsApi.disconnect(account.id);
    load();
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteStatus("");
    try {
      await householdsApi.invite({ email: inviteEmail, role: "editor" });
      setInviteStatus(`Invitation sent to ${inviteEmail}`);
      setInviteEmail("");
      load();
    } catch (err: unknown) {
      setInviteStatus("Failed: " + ((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Unknown error"));
    } finally {
      setInviting(false);
    }
  }

  const TABS = [
    { key: "accounts", label: "Accounts", icon: Link2 },
    { key: "household", label: "Household", icon: UserPlus },
    { key: "profile", label: "Profile", icon: Shield },
    { key: "privacy", label: "Privacy", icon: Eye },
  ] as const;

  const plaidAccounts = accounts.filter((a) => a.provider === "plaid");
  const hasSomeAccounts = accounts.length > 0;

  return (
    <div className="space-y-6 animate-slide-in max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage accounts, household, and privacy</p>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key as typeof tab)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all",
              tab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            )}
          >
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {/* ── Accounts ── */}
      {tab === "accounts" && (
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Connected Banks</h2>
              <div className="flex items-center gap-2">
                {plaidAccounts.length > 0 && <SyncButton onSync={load} />}
                <PlaidLinkButton onSuccess={load} />
              </div>
            </div>

            {!hasSomeAccounts ? (
              <div className="text-center py-10 text-gray-400">
                <Building2 size={36} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium text-gray-500 mb-1">No bank accounts connected</p>
                <p className="text-xs mb-4">Connect your bank to start tracking transactions automatically.</p>
                <PlaidLinkButton onSuccess={load} variant="large" />
              </div>
            ) : (
              <div className="space-y-2">
                {accounts.map((acc) => (
                  <div key={acc.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm text-gray-900">{acc.name}</p>
                        <span className={cn(
                          "badge text-[10px]",
                          acc.type === "checking" ? "bg-blue-100 text-blue-700" :
                          acc.type === "savings" ? "bg-emerald-100 text-emerald-700" :
                          acc.type === "credit" ? "bg-amber-100 text-amber-700" :
                          "bg-gray-100 text-gray-600"
                        )}>{acc.type}</span>
                        {acc.provider === "plaid" && (
                          <span className="badge bg-teal-50 text-teal-700 text-[10px]">Live</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{formatCurrency(Math.abs(acc.current_balance))}</p>
                    </div>
                    <button
                      onClick={() => toggleShared(acc)}
                      className={cn(
                        "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all",
                        acc.is_shared ? "border-brand-200 text-brand-700 bg-brand-50" : "border-gray-200 text-gray-500 bg-white"
                      )}
                    >
                      {acc.is_shared ? <><Eye size={12} />Shared</> : <><EyeOff size={12} />Private</>}
                    </button>
                    <button
                      onClick={() => disconnect(acc)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-gray-400 mt-3">
              <Shield size={11} className="inline mr-1" />
              Bank connections are read-only via Plaid. We never store your banking credentials.
            </p>
          </div>
        </div>
      )}

      {/* ── Household ── */}
      {tab === "household" && (
        <div className="space-y-4">
          {loading ? (
            <div className="card">
              <div className="shimmer h-32 rounded-xl" />
            </div>
          ) : household ? (
            <div className="card">
              <h2 className="font-semibold text-gray-900 mb-4">{household.name}</h2>

              {/* Members */}
              <div className="space-y-2 mb-6">
                {(household.members ?? []).map((m) => (
                  <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                    <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold">
                      {m.user.full_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{m.user.full_name}</p>
                      <p className="text-xs text-gray-400">{m.user.email}</p>
                    </div>
                    <span className={cn(
                      "badge capitalize",
                      m.role === "owner" ? "bg-brand-100 text-brand-700" : "bg-gray-100 text-gray-600"
                    )}>{m.role}</span>
                  </div>
                ))}
              </div>

              {/* Invite */}
              <div className="border-t border-gray-100 pt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Invite your partner</h3>
                {inviteStatus && (
                  <div className={cn(
                    "p-3 rounded-xl text-xs mb-3",
                    inviteStatus.includes("Failed") ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  )}>
                    {inviteStatus}
                  </div>
                )}
                <form onSubmit={sendInvite} className="flex gap-2">
                  <input
                    type="email"
                    placeholder="partner@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="input flex-1"
                    required
                  />
                  <button type="submit" disabled={inviting} className="btn-primary flex-shrink-0">
                    <UserPlus size={15} />
                    {inviting ? "Sending…" : "Invite"}
                  </button>
                </form>
                <p className="text-xs text-gray-400 mt-2">
                  They&apos;ll get a link valid for 7 days to join your household with their own login.
                </p>
              </div>

              {/* Pending */}
              {(household.pending_invitations ?? []).length > 0 && (
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Pending invitations</h3>
                  {household.pending_invitations.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between p-2 rounded-lg bg-amber-50 border border-amber-100">
                      <span className="text-xs text-amber-800">{inv.email}</span>
                      <span className="badge bg-amber-100 text-amber-700 text-[10px]">Pending</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="card text-center text-gray-400 py-8">
              <p className="text-sm">No household found. Please reload the page.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Profile ── */}
      {tab === "profile" && <ProfileTab user={user} setUser={setUser} />}

      {/* ── Privacy ── */}
      {tab === "privacy" && (
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-900">Privacy Controls</h2>
          <div className="space-y-3 text-sm text-gray-600">
            {[
              { title: "Account visibility", body: "Control which accounts your partner can see. Toggle per-account in the Accounts tab." },
              { title: "Read-only bank access", body: "WealthView Duo requests read-only access via Plaid. No payment or transfer capabilities." },
              { title: "Data export", body: "You can export all your data at any time. Contact support to request a data export." },
              { title: "Account deletion", body: "Deleting your account permanently removes all data and disconnects all bank accounts." },
            ].map(({ title, body }) => (
              <div key={title} className="p-3 rounded-xl bg-gray-50 border border-gray-100">
                <p className="font-medium text-gray-900 mb-1">{title}</p>
                <p className="text-xs text-gray-500">{body}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileTab({ user, setUser }: { user: User | null; setUser: (u: User | null) => void }) {
  const [name, setName] = useState(user?.full_name ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await usersApi.update({ full_name: name });
      setUser(res.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <h2 className="font-semibold text-gray-900 mb-4">Profile</h2>
      <form onSubmit={save} className="space-y-4 max-w-sm">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Full name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
          <input className="input bg-gray-50 text-gray-500 cursor-not-allowed" value={user?.email ?? ""} disabled />
          <p className="text-xs text-gray-400 mt-1">Email cannot be changed here</p>
        </div>
        <button type="submit" disabled={saving} className="btn-primary">
          {saved ? "✓ Saved" : saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}
