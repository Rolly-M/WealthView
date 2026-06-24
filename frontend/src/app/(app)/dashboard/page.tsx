"use client";

import { useEffect, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import {
  TrendingUp, TrendingDown, Wallet, Target, AlertCircle,
  RefreshCw, Users, ChevronRight
} from "lucide-react";
import Link from "next/link";
import { accountsApi, transactionsApi, insightsApi, goalsApi } from "@/lib/api";
import { formatCurrency, getCategoryConfig, severityIcon, cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import type { Account, Insight, Goal, SpendingSummary } from "@/types";

function SkeletonCard({ className }: { className?: string }) {
  return <div className={cn("shimmer h-28 rounded-2xl", className)} />;
}

function MetricCard({
  label, value, sub, trend, icon: Icon, color = "brand"
}: {
  label: string; value: string; sub?: string; trend?: number; icon: any; color?: string;
}) {
  const colors = {
    brand: "bg-brand-50 text-brand-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
  } as const;
  return (
    <div className="card card-hover">
      <div className="flex items-start justify-between mb-3">
        <p className="metric-label">{label}</p>
        <div className={cn("p-2 rounded-xl", colors[color as keyof typeof colors])}>
          <Icon size={18} />
        </div>
      </div>
      <p className="metric-value">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      {trend !== undefined && (
        <div className={cn("flex items-center gap-1 text-xs font-medium mt-2", trend >= 0 ? "text-emerald-600" : "text-red-500")}>
          {trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {Math.abs(trend).toFixed(1)}% vs last month
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [netWorth, setNetWorth] = useState<any>(null);
  const [summary, setSummary] = useState<SpendingSummary | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const today = now.toISOString().split("T")[0];

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [acctRes, nwRes, sumRes, insRes, goalRes] = await Promise.allSettled([
        accountsApi.list(),
        accountsApi.netWorth(),
        transactionsApi.summary(monthStart, today),
        insightsApi.list({ limit: 5 }),
        goalsApi.list(),
      ]);
      if (acctRes.status === "fulfilled") setAccounts(acctRes.value.data);
      if (nwRes.status === "fulfilled") setNetWorth(nwRes.value.data);
      if (sumRes.status === "fulfilled") setSummary(sumRes.value.data);
      if (insRes.status === "fulfilled") setInsights(insRes.value.data);
      if (goalRes.status === "fulfilled") setGoals(goalRes.value.data);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }

  const greeting = (() => {
    const h = now.getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  const spending_data = summary?.by_category.slice(0, 6).map((c) => ({
    name: getCategoryConfig(c.category).label,
    value: Number(c.total),
    color: getCategoryConfig(c.category).color,
  })) ?? [];

  const savingsRate = summary?.savings_rate ?? 0;

  return (
    <div className="space-y-8 animate-slide-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {greeting}, {user?.full_name.split(" ")[0]} 👋
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Here's your household's financial snapshot for{" "}
            {now.toLocaleString("en-US", { month: "long", year: "numeric" })}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="btn-secondary"
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* KPI row */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Net Worth"
            value={formatCurrency(netWorth?.net_worth ?? 0)}
            sub={`${formatCurrency(netWorth?.total_assets ?? 0)} assets`}
            icon={TrendingUp}
            color="brand"
          />
          <MetricCard
            label="Cash Available"
            value={formatCurrency(
              accounts
                .filter((a) => a.type === "checking" || a.type === "savings")
                .reduce((s, a) => s + Number(a.current_balance), 0)
            )}
            sub={`${accounts.filter((a) => a.type === "checking").length} checking account(s)`}
            icon={Wallet}
            color="emerald"
          />
          <MetricCard
            label="Spent This Month"
            value={formatCurrency(Number(summary?.total_spent ?? 0))}
            sub={`${summary?.transaction_count ?? 0} transactions`}
            icon={TrendingDown}
            color="amber"
          />
          <MetricCard
            label="Savings Rate"
            value={`${savingsRate.toFixed(1)}%`}
            sub={`$${Number(summary?.savings ?? 0).toFixed(0)} saved`}
            icon={Target}
            color={savingsRate >= 20 ? "emerald" : savingsRate >= 10 ? "amber" : "red"}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Spending by Category */}
        <div className="card lg:col-span-2">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Spending by Category</h2>
          {loading ? (
            <div className="shimmer h-48 rounded-xl" />
          ) : spending_data.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
              No spending data yet this month
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={spending_data} margin={{ left: -10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  formatter={(v: number) => [formatCurrency(v), "Spent"]}
                  contentStyle={{ borderRadius: "12px", border: "1px solid #e5e7eb", fontSize: 12 }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {spending_data.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Spending Donut */}
        <div className="card">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Breakdown</h2>
          {loading ? (
            <div className="shimmer h-48 rounded-xl" />
          ) : spending_data.length > 0 ? (
            <div>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={spending_data}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {spending_data.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => [formatCurrency(v), ""]}
                    contentStyle={{ borderRadius: "12px", border: "1px solid #e5e7eb", fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-1.5">
                {spending_data.slice(0, 4).map((d) => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                      <span className="text-gray-600">{d.name}</span>
                    </div>
                    <span className="font-medium tabular">{formatCurrency(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Insights */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Recent Insights</h2>
            <Link href="/insights" className="text-xs text-brand-600 font-medium hover:underline flex items-center gap-1">
              View all <ChevronRight size={12} />
            </Link>
          </div>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="shimmer h-16 rounded-xl" />)}
            </div>
          ) : insights.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-gray-400">
              <AlertCircle size={32} className="mb-2 opacity-30" />
              <p className="text-sm">Insights will appear after your first sync</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {insights.slice(0, 4).map((ins) => (
                <div
                  key={ins.id}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-xl border text-sm",
                    ins.severity === "positive" && "bg-emerald-50 border-emerald-100",
                    ins.severity === "warning" && "bg-amber-50 border-amber-100",
                    ins.severity === "info" && "bg-blue-50 border-blue-100",
                    ins.severity === "critical" && "bg-red-50 border-red-100",
                  )}
                >
                  <span className="text-base flex-shrink-0">{severityIcon(ins.severity)}</span>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 text-xs leading-snug">{ins.title}</p>
                    <p className="text-gray-500 text-xs mt-0.5 line-clamp-2">{ins.body}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Goals */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Savings Goals</h2>
            <Link href="/goals" className="text-xs text-brand-600 font-medium hover:underline flex items-center gap-1">
              View all <ChevronRight size={12} />
            </Link>
          </div>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="shimmer h-16 rounded-xl" />)}
            </div>
          ) : goals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-gray-400">
              <Target size={32} className="mb-2 opacity-30" />
              <p className="text-sm">No goals yet</p>
              <Link href="/goals" className="text-brand-600 text-xs mt-2 font-medium hover:underline">Create a goal →</Link>
            </div>
          ) : (
            <div className="space-y-4">
              {goals.slice(0, 3).map((goal) => (
                <div key={goal.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span>{goal.emoji ?? "🎯"}</span>
                      <span className="text-sm font-medium text-gray-900">{goal.name}</span>
                    </div>
                    <span className="text-xs font-semibold text-gray-700 tabular">
                      {goal.progress_pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(goal.progress_pct, 100)}%`,
                        background: goal.color ?? "#14b8a6",
                      }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-gray-400">{formatCurrency(goal.current_amount)}</span>
                    <span className="text-xs text-gray-400">{formatCurrency(goal.target_amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Accounts */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Linked Accounts</h2>
          <Link href="/settings" className="text-xs text-brand-600 font-medium hover:underline flex items-center gap-1">
            Manage <ChevronRight size={12} />
          </Link>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="shimmer h-20 rounded-xl" />)}
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-gray-400 text-sm">
            <Users size={32} className="mb-2 opacity-30" />
            <p>No accounts linked yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {accounts.map((acc) => (
              <div key={acc.id} className="p-4 rounded-xl bg-gray-50 border border-gray-100 hover:border-brand-200 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-500 truncate">{acc.name}</p>
                  {!acc.is_shared && (
                    <span className="badge bg-gray-100 text-gray-500 text-[10px]">Private</span>
                  )}
                </div>
                <p className="text-base font-bold text-gray-900 tabular">
                  {formatCurrency(Math.abs(Number(acc.current_balance)))}
                </p>
                <p className="text-xs text-gray-400 mt-0.5 capitalize">{acc.type}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
