"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, ChevronRight } from "lucide-react";
import { budgetsApi } from "@/lib/api";
import { formatCurrency, getCategoryConfig, cn } from "@/lib/utils";
import type { Budget, BudgetProgress } from "@/types";

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [progress, setProgress] = useState<Record<string, BudgetProgress>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await budgetsApi.list();
      setBudgets(res.data);
      const progressResults = await Promise.allSettled(
        res.data.map((b: Budget) => budgetsApi.progress(b.id))
      );
      const p: Record<string, BudgetProgress> = {};
      progressResults.forEach((r, i) => {
        if (r.status === "fulfilled") p[res.data[i].id] = r.value.data;
      });
      setProgress(p);
    } finally {
      setLoading(false);
    }
  }

  async function deleteBudget(id: string) {
    if (!confirm("Delete this budget?")) return;
    await budgetsApi.delete(id);
    load();
  }

  const now = new Date();

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Budgets</h1>
          <p className="text-sm text-gray-500 mt-1">Track spending against your household budgets</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={16} /> New budget
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="shimmer h-40 rounded-2xl" />)}
        </div>
      ) : budgets.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-20 text-center">
          <div className="text-5xl mb-4">💰</div>
          <h3 className="font-semibold text-gray-900 mb-2">No budgets yet</h3>
          <p className="text-sm text-gray-500">Create a monthly budget to track your household spending</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary mt-4">
            <Plus size={15} /> Create budget
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {budgets.map((budget) => {
            const prog = progress[budget.id];
            const pct = prog?.pct_used ?? 0;
            const barColor = pct > 100 ? "#ef4444" : pct > 80 ? "#f59e0b" : "#14b8a6";
            return (
              <div key={budget.id} className="card card-hover">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">{budget.name}</h3>
                    <p className="text-xs text-gray-400 mt-0.5 capitalize">
                      {budget.period} · {budget.scope}
                      {budget.month && budget.year && ` · ${new Date(budget.year, budget.month - 1).toLocaleString("en-US", { month: "long" })} ${budget.year}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "badge",
                      pct > 100 ? "bg-red-100 text-red-700" :
                      pct > 80 ? "bg-amber-100 text-amber-700" :
                      "bg-emerald-100 text-emerald-700"
                    )}>
                      {pct.toFixed(0)}% used
                    </span>
                    <button
                      onClick={() => deleteBudget(budget.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Overall bar */}
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                    <span>{formatCurrency(prog?.total_spent ?? 0)} spent</span>
                    <span>{formatCurrency(Number(budget.total_amount))} total</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(pct, 100)}%`, background: barColor }}
                    />
                  </div>
                  {prog?.projected_overspend && prog.projected_overspend > 0 && (
                    <p className="text-xs text-amber-600 mt-1.5">
                      ⚠️ Projected to overspend by {formatCurrency(prog.projected_overspend)}
                    </p>
                  )}
                  {prog && (
                    <p className="text-xs text-gray-400 mt-1">{prog.days_remaining} days remaining</p>
                  )}
                </div>

                {/* Category breakdown */}
                {prog?.categories_progress && prog.categories_progress.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {prog.categories_progress.slice(0, 6).map((c) => {
                      const cfg = getCategoryConfig(c.category);
                      const catPct = c.pct;
                      return (
                        <div key={c.category} className="p-2.5 rounded-xl bg-gray-50">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className="text-sm">{cfg.emoji}</span>
                            <span className="text-xs font-medium text-gray-700 truncate">{cfg.label}</span>
                          </div>
                          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mb-1">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(catPct, 100)}%`,
                                background: catPct > 100 ? "#ef4444" : cfg.color,
                              }}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] text-gray-400">
                            <span>${c.spent.toFixed(0)}</span>
                            <span>${c.budget.toFixed(0)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateBudgetModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

function CreateBudgetModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const now = new Date();
  const [form, setForm] = useState({
    name: "Monthly Household Budget",
    period: "monthly",
    scope: "household",
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    total_amount: "6000",
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await budgetsApi.create({
        ...form,
        total_amount: parseFloat(form.total_amount),
        month: form.period === "monthly" ? form.month : undefined,
        year: form.period === "monthly" ? form.year : undefined,
      });
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md shadow-card-lg">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Create Budget</h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Budget name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Period</label>
              <select className="input" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })}>
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Scope</label>
              <select className="input" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
                <option value="household">Household</option>
                <option value="personal">Personal</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Total amount ($)</label>
            <input type="number" className="input" value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })} min="0" step="100" required />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? "Creating…" : "Create budget"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
