"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Link2, UserPlus, Shield, Eye, EyeOff, RefreshCw, Building2, AlertTriangle, Copy, Check, Mail, MessageCircle, ChevronDown, ChevronRight } from "lucide-react";
import { accountsApi, householdsApi, usersApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { formatCurrency, formatSignedCurrency, cn, groupAccounts, ALL_OWNERS_KEY } from "@/lib/utils";
import type { Account, Household, User } from "@/types";
import { usePlaidLink } from "react-plaid-link";
import { createClient } from "@/lib/supabase/client";

// ─── Plaid Link button ────────────────────────────────────────────────────────
// Inner component — only mounted once we have a valid token
function PlaidLinkInner({
  token, onSuccess, variant,
}: {
  token: string; onSuccess: () => void; variant: "default" | "large";
}) {
  const [connecting, setConnecting] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const { open, ready } = usePlaidLink({
    token,
    onSuccess: async (publicToken, metadata) => {
      setConnecting(true);
      setLinkError(null);
      try {
        const res = await fetch("/api/plaid/exchange-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ public_token: publicToken, institution_name: metadata.institution?.name ?? null }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error ?? `Server error ${res.status}`);
        }
        onSuccess();
      } catch (err: unknown) {
        setLinkError((err as Error)?.message ?? "Failed to connect bank");
      } finally {
        setConnecting(false);
      }
    },
    onExit: (err) => {
      if (err) setLinkError(err.display_message ?? err.error_message ?? null);
    },
  });

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => { setLinkError(null); open(); }}
        disabled={!ready || connecting}
        className={variant === "large" ? "btn-primary" : "btn-primary text-xs py-2"}
      >
        <Building2 size={variant === "large" ? 16 : 13} />
        {connecting ? "Importing…" : !ready ? "Initialising…" : "Connect bank account"}
      </button>
      {linkError && (
        <p className="text-xs text-red-500 max-w-xs text-right">{linkError}</p>
      )}
    </div>
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
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `Server error ${res.status}`);
      setResult(`Synced ${d.synced} transactions`);
      onSync();
    } catch (err: unknown) {
      setResult((err as Error)?.message ?? "Sync failed");
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
  const [inviting, setInviting] = useState(false);
  const [inviteStatus, setInviteStatus] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [expandedInviteId, setExpandedInviteId] = useState<string | null>(null);
  const [appOrigin, setAppOrigin] = useState("");
  const [expandedBanks, setExpandedBanks] = useState<Set<string>>(new Set());

  function toggleBank(key: string) {
    setExpandedBanks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  useEffect(() => { setAppOrigin(window.location.origin); }, []);

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

  async function generateInvite() {
    setInviting(true);
    setInviteStatus("");
    setInviteUrl("");
    try {
      const { data } = await householdsApi.invite({ role: "editor" });
      setInviteUrl(data.invite_url);
      load();
    } catch (err: unknown) {
      setInviteStatus("Failed: " + ((err as Error)?.message ?? "Unknown error"));
    } finally {
      setInviting(false);
    }
  }

  async function cancelInvite(id: string) {
    if (!confirm("Cancel this invitation? The link will stop working.")) return;
    try {
      await householdsApi.cancelInvite(id);
      load();
    } catch (err: unknown) {
      setInviteStatus("Failed to cancel: " + ((err as Error)?.message ?? "Unknown error"));
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
              <div className="space-y-5">
                {groupAccounts(accounts, household).map(([ownerLabel, banks]) => (
                  <div key={ownerLabel}>
                    {ownerLabel !== ALL_OWNERS_KEY && (
                      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{ownerLabel}</h3>
                    )}
                    <div className="space-y-2">
                      {banks.map(([bankLabel, bankAccounts]) => {
                        const bankKey = `${ownerLabel}::${bankLabel}`;
                        const expanded = expandedBanks.has(bankKey);
                        const netBalance = bankAccounts.reduce((sum, a) => {
                          const isLiability = a.type === "credit" || a.type === "loan" || a.type === "mortgage";
                          return sum + (isLiability ? -Math.abs(a.current_balance) : a.current_balance);
                        }, 0);
                        return (
                          <div key={bankLabel} className="rounded-xl border border-gray-100 overflow-hidden">
                            <button
                              onClick={() => toggleBank(bankKey)}
                              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors"
                            >
                              <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
                                {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                <Building2 size={12} />{bankLabel}
                                <span className="text-gray-400 font-normal">
                                  · {bankAccounts.length} account{bankAccounts.length === 1 ? "" : "s"}
                                </span>
                              </div>
                              <span className="text-xs font-semibold text-gray-600 tabular">
                                {formatSignedCurrency(netBalance)}
                              </span>
                            </button>
                            {expanded && (
                              <div className="space-y-2 p-2">
                                {bankAccounts.map((acc) => (
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
                                    {acc.owner_id === user?.id ? (
                                      <>
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
                                      </>
                                    ) : (
                                      // Only visible here because its owner shared it — not
                                      // yours to toggle or disconnect.
                                      <span className="badge bg-brand-50 text-brand-600 text-[10px] flex-shrink-0">
                                        Partner&apos;s
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
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
                    {m.user.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- user-uploaded image from Supabase Storage, not an optimizable static asset
                      <img src={m.user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {m.user.full_name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
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
                  <div className="p-3 rounded-xl text-xs mb-3 bg-red-50 text-red-700 border border-red-200">
                    {inviteStatus}
                  </div>
                )}
                {inviteUrl ? (
                  <div>
                    <InviteLinkShare url={inviteUrl} label="Invite created — share this link however you like:" />
                    <button
                      onClick={() => setInviteUrl("")}
                      className="text-xs text-brand-600 hover:underline mt-2"
                    >
                      Create another invite
                    </button>
                  </div>
                ) : (
                  <>
                    <button onClick={generateInvite} disabled={inviting} className="btn-primary">
                      <UserPlus size={15} />
                      {inviting ? "Creating…" : "Generate invite link"}
                    </button>
                    <p className="text-xs text-gray-400 mt-2">
                      Valid for 7 days. Share it however you like — email, text, or WhatsApp — whoever opens it and signs up joins your household.
                    </p>
                  </>
                )}
              </div>

              {/* Pending */}
              {(household.pending_invitations ?? []).length > 0 && (
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Pending invitations</h3>
                  <div className="space-y-1.5">
                    {household.pending_invitations.map((inv) => (
                      <div key={inv.id} className="rounded-lg bg-amber-50 border border-amber-100 overflow-hidden">
                        <div className="flex items-center justify-between gap-2 p-2">
                          <span className="text-xs text-amber-800 truncate">{inv.email || "Open invite link"}</span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="badge bg-amber-100 text-amber-700 text-[10px]">Pending</span>
                            <button
                              onClick={() => setExpandedInviteId(expandedInviteId === inv.id ? null : inv.id)}
                              className="text-xs text-brand-600 hover:underline"
                            >
                              {expandedInviteId === inv.id ? "Hide link" : "Share link"}
                            </button>
                            <button
                              onClick={() => cancelInvite(inv.id)}
                              className="text-xs text-red-600 hover:underline"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                        {expandedInviteId === inv.id && appOrigin && (
                          <div className="p-2 pt-0">
                            <InviteLinkShare url={`${appOrigin}/invite/${inv.token}`} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
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
        <div className="space-y-4">
          <div className="card space-y-4">
            <h2 className="font-semibold text-gray-900">Privacy Controls</h2>
            <MfaSection required={!!user?.mfa_required} />
            <ChangePasswordSection />

            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
              <p className="font-medium text-gray-900 text-sm mb-1">Account visibility</p>
              <p className="text-xs text-gray-500 mb-3">Control which of your own accounts your partner can see.</p>
              {(() => {
                const myAccounts = accounts.filter((a) => a.owner_id === user?.id);
                if (myAccounts.length === 0) {
                  return <p className="text-xs text-gray-400">No accounts linked yet.</p>;
                }
                return (
                  <div className="space-y-3">
                    {groupAccounts(myAccounts, null).map(([, banks]) =>
                      banks.map(([bankLabel, bankAccounts]) => (
                        <div key={bankLabel}>
                          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1.5">
                            <Building2 size={11} />{bankLabel}
                          </div>
                          <div className="space-y-1.5">
                            {bankAccounts.map((acc) => (
                              <div key={acc.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-gray-100">
                                <span className="text-xs text-gray-700 truncate">{acc.name}</span>
                                <button
                                  onClick={() => toggleShared(acc)}
                                  className={cn(
                                    "flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border transition-all flex-shrink-0",
                                    acc.is_shared ? "border-brand-200 text-brand-700 bg-brand-50" : "border-gray-200 text-gray-500 bg-white"
                                  )}
                                >
                                  {acc.is_shared ? <><Eye size={11} />Shared</> : <><EyeOff size={11} />Private</>}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
              <p className="font-medium text-gray-900 text-sm mb-1">Read-only bank access</p>
              <p className="text-xs text-gray-500">WealthView Duo requests read-only access via Plaid. No payment or transfer capabilities.</p>
            </div>

            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900 text-sm mb-1">Data export</p>
                  <p className="text-xs text-gray-500">Download all your accounts, transactions, budgets, and goals as a JSON file.</p>
                </div>
                <a href="/api/profile/export" className="btn-secondary text-xs py-2 flex-shrink-0">
                  Export data
                </a>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
              <p className="font-medium text-gray-900 text-sm mb-1">Account deletion</p>
              <p className="text-xs text-gray-500">Deleting your account permanently removes all data and disconnects all bank accounts. Available in the Profile tab.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Two-factor authentication (TOTP) ──────────────────────────────────────────
function MfaSection({ required }: { required: boolean }) {
  const [factors, setFactors] = useState<{ id: string; status: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);

  const loadFactors = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.totp ?? []).filter((f) => f.status === "verified"));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadFactors();
  }, [loadFactors]);

  async function startEnroll() {
    setError("");
    setEnrolling(true);
    const supabase = createClient();
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (enrollError) {
      setError(enrollError.message);
      setEnrolling(false);
      return;
    }
    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
  }

  function cancelEnroll() {
    setEnrolling(false);
    setQrCode(null);
    setSecret(null);
    setFactorId(null);
    setCode("");
    setError("");
  }

  async function verifyCode(e: React.FormEvent) {
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

    setVerifying(false);
    cancelEnroll();
    loadFactors();
  }

  async function removeFactor(id: string) {
    if (!confirm("Turn off two-factor authentication? You'll only need your password to sign in.")) return;
    const supabase = createClient();
    await supabase.auth.mfa.unenroll({ factorId: id });
    loadFactors();
  }

  if (loading) return null;

  return (
    <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
      <div className="flex items-center justify-between mb-1">
        <p className="font-medium text-gray-900">Two-factor authentication</p>
        {factors.length > 0 && (
          <span className="badge bg-emerald-100 text-emerald-700">Enabled</span>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Require a code from an authenticator app (Google Authenticator, Authy, 1Password, etc.) when signing in.
        {required && " Required for this account — set up at signup."}
      </p>

      {error && (
        <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs mb-3">{error}</div>
      )}

      {factors.length > 0 && !enrolling && (
        <div className="space-y-2">
          {factors.map((f) => (
            <div key={f.id} className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-gray-100">
              <span className="text-xs text-gray-600">Authenticator app</span>
              {required ? (
                <span className="text-xs text-gray-400">Required</span>
              ) : (
                <button onClick={() => removeFactor(f.id)} className="text-xs text-red-600 hover:underline">
                  Turn off
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {factors.length === 0 && !enrolling && (
        <button onClick={startEnroll} className="btn-secondary text-xs py-2">
          Enable two-factor authentication
        </button>
      )}

      {enrolling && (
        <div className="space-y-3">
          {qrCode && (
            <div className="flex flex-col items-center gap-2 p-3 bg-white rounded-lg border border-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element -- data: URI SVG from Supabase, not an optimizable asset */}
              <img src={qrCode} alt="Scan with your authenticator app" width={160} height={160} />
              <p className="text-[11px] text-gray-400 text-center">
                Can&apos;t scan? Enter this code manually:
                <br />
                <code className="text-gray-600 break-all">{secret}</code>
              </p>
            </div>
          )}
          <form onSubmit={verifyCode} className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="input flex-1"
              required
              autoFocus
            />
            <button type="submit" disabled={verifying} className="btn-primary text-xs py-2 flex-shrink-0">
              {verifying ? "Verifying…" : "Verify"}
            </button>
          </form>
          <button onClick={cancelEnroll} className="text-xs text-gray-400 hover:underline">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Change password ────────────────────────────────────────────────────────
function ChangePasswordSection() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  function reset() {
    setOpen(false);
    setPassword("");
    setConfirm("");
    setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }

    setSaving(true);
    setError("");
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw new Error(updateError.message);
      reset();
      setDone(true);
      setTimeout(() => setDone(false), 3000);
    } catch (err: unknown) {
      setError((err as Error)?.message ?? "Failed to change password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-gray-900">Password</p>
          <p className="text-xs text-gray-500 mt-0.5">Change the password used to sign in.</p>
        </div>
        {!open && (
          <button onClick={() => setOpen(true)} className="btn-secondary text-xs py-2 flex-shrink-0">
            Change password
          </button>
        )}
      </div>

      {done && <p className="text-xs text-emerald-700 mt-3">✓ Password updated.</p>}

      {open && (
        <form onSubmit={submit} className="space-y-3 mt-3 max-w-sm">
          {error && <p className="text-xs text-red-600">{error}</p>}
          <input
            type="password"
            placeholder="New password (min. 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input text-sm"
            minLength={8}
            required
            autoFocus
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="input text-sm"
            required
          />
          <div className="flex gap-2">
            <button type="button" onClick={reset} className="btn-secondary text-xs py-2 flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary text-xs py-2 flex-1">
              {saving ? "Saving…" : "Save password"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Email verification status ─────────────────────────────────────────────────
function EmailVerificationStatus({ user }: { user: User | null }) {
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");

  if (!user) return null;

  async function resend() {
    setSending(true);
    setStatus("");
    try {
      const res = await fetch("/api/auth/send-verification", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Failed to send verification email");
      setStatus(d.sent ? "Verification email sent — check your inbox." : (d.error ?? "Couldn't send the email right now, try again shortly."));
    } catch (err: unknown) {
      setStatus((err as Error)?.message ?? "Something went wrong");
    } finally {
      setSending(false);
    }
  }

  if (user.is_verified) {
    return (
      <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
        <span>✓</span> Email verified
      </div>
    );
  }

  return (
    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-amber-800">Your email isn&apos;t verified yet.</p>
        <button onClick={resend} disabled={sending} className="text-xs font-medium text-amber-800 hover:underline flex-shrink-0">
          {sending ? "Sending…" : "Resend email"}
        </button>
      </div>
      {status && <p className="text-xs text-amber-700 mt-1.5">{status}</p>}
    </div>
  );
}

// ─── Invite link share ──────────────────────────────────────────────────────
function InviteLinkShare({ url, label }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const message = "Join our household on WealthView Duo so we can track our finances together:";
  const mailtoHref = `mailto:?subject=${encodeURIComponent("Join me on WealthView Duo")}&body=${encodeURIComponent(`${message}\n\n${url}`)}`;
  const smsHref = `sms:?body=${encodeURIComponent(`${message} ${url}`)}`;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(`${message} ${url}`)}`;

  return (
    <div className="p-3 rounded-xl bg-brand-50 border border-brand-100">
      {label && <p className="text-xs text-brand-800 mb-2">{label}</p>}
      <div className="flex items-center gap-2 mb-3">
        <input readOnly value={url} onFocus={(e) => e.target.select()} className="input flex-1 text-xs" />
        <button type="button" onClick={copy} className="btn-secondary flex-shrink-0 !px-3" title="Copy link">
          {copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <a href={mailtoHref} className="btn-secondary text-xs flex items-center gap-1.5 !px-3">
          <Mail size={13} /> Email
        </a>
        <a href={smsHref} className="btn-secondary text-xs flex items-center gap-1.5 !px-3">
          <MessageCircle size={13} /> Text
        </a>
        <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs flex items-center gap-1.5 !px-3">
          WhatsApp
        </a>
      </div>
    </div>
  );
}

const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "AUD"];
const LOCALES = [
  { value: "en-US", label: "English (US)" },
  { value: "en-CA", label: "English (Canada)" },
  { value: "fr-CA", label: "Français (Canada)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "fr-FR", label: "Français (France)" },
];

// ─── Avatar upload ──────────────────────────────────────────────────────────
function AvatarUpload({ user, setUser }: { user: User | null; setUser: (u: User | null) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const initials = user?.full_name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) ?? "?";

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5MB.");
      return;
    }

    setError("");
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() ?? "jpg";
      // Fixed filename (not timestamped) so re-uploading overwrites in place
      // rather than accumulating orphaned files in the bucket forever.
      const path = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, cacheControl: "3600" });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      // Cache-bust so the new image shows immediately instead of the
      // browser (or an <img> already on screen) serving the old cached one
      // from the same URL.
      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const res = await usersApi.update({ avatar_url: avatarUrl });
      setUser(res.data);
    } catch (err: unknown) {
      setError((err as Error)?.message ?? "Failed to upload image");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative w-16 h-16 flex-shrink-0">
        {user?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded image from Supabase Storage, not an optimizable static asset
          <img src={user.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover border border-gray-100" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-brand-600 flex items-center justify-center text-white text-lg font-bold">
            {initials}
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
            <RefreshCw size={16} className="text-white animate-spin" />
          </div>
        )}
      </div>
      <div>
        <label className="btn-secondary text-xs py-2 cursor-pointer inline-flex">
          Change photo
          <input type="file" accept="image/*" className="hidden" onChange={handleFile} disabled={uploading} />
        </label>
        <p className="text-xs text-gray-400 mt-1.5">JPG or PNG, up to 5MB</p>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
    </div>
  );
}

function ProfileTab({ user, setUser }: { user: User | null; setUser: (u: User | null) => void }) {
  const router = useRouter();
  const { clearAuth } = useAuthStore();
  const [name, setName] = useState(user?.full_name ?? "");
  const [currency, setCurrency] = useState(user?.currency ?? "USD");
  const [locale, setLocale] = useState(user?.locale ?? "en-US");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await usersApi.update({ full_name: name, currency, locale });
      setUser(res.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch("/api/profile", { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to delete account");
      }
      await clearAuth();
      router.push("/login");
    } catch (err: unknown) {
      setDeleteError((err as Error)?.message ?? "Something went wrong");
      setDeleting(false);
    }
  }

  const confirmPhrase = "delete my account";

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">Profile</h2>
        <AvatarUpload user={user} setUser={setUser} />
        <form onSubmit={save} className="space-y-4 max-w-sm mt-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Full name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <input className="input bg-gray-50 text-gray-500 cursor-not-allowed" value={user?.email ?? ""} disabled />
            <p className="text-xs text-gray-400 mt-1">Email cannot be changed here</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Currency</label>
              <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Language & region</label>
              <select className="input" value={locale} onChange={(e) => setLocale(e.target.value)}>
                {LOCALES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" disabled={saving} className="btn-primary">
            {saved ? "✓ Saved" : saving ? "Saving…" : "Save changes"}
          </button>
        </form>
      </div>

      <EmailVerificationStatus user={user} />

      {/* Danger zone */}
      <div className="card border border-red-200">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 text-sm">Delete account</h3>
            <p className="text-xs text-gray-500 mt-1">
              Permanently delete your account and all associated data — transactions, budgets, goals, and bank connections. This cannot be undone.
            </p>
          </div>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            Delete account
          </button>
        </div>
      </div>

      {/* Confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Delete your account?</h3>
                <p className="text-xs text-gray-500">This action is permanent and cannot be undone.</p>
              </div>
            </div>

            <ul className="text-xs text-gray-600 space-y-1 mb-5 bg-red-50 rounded-xl p-3 border border-red-100">
              <li>• All your transactions will be deleted</li>
              <li>• All budgets and goals will be deleted</li>
              <li>• All bank connections will be removed</li>
              <li>• Your household data will be removed</li>
              <li>• Your account cannot be recovered</li>
            </ul>

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Type <span className="font-mono font-bold text-red-600">{confirmPhrase}</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={confirmPhrase}
                className="input text-sm"
                autoFocus
              />
            </div>

            {deleteError && (
              <p className="text-xs text-red-600 mb-3">{deleteError}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteConfirm(""); setDeleteError(""); }}
                className="btn-secondary flex-1"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirm !== confirmPhrase || deleting}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {deleting ? "Deleting…" : "Yes, delete everything"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
