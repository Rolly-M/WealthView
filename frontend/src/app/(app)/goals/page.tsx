"use client";

import { useEffect, useState } from "react";
import { Plus, Target, Calendar, TrendingUp } from "lucide-react";
import { goalsApi } from "@/lib/api";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import type { Goal } from "@/types";

const GOAL_TYPES = [
  { value: "savings", label: "General Savings", emoji: "💰" },
  { value: "emergency_fund", label: "Emergency Fund", emoji: "🛡️" },
  { value: "vacation", label: "Vacation", emoji: "✈️" },
  { value: "home_purchase", label: "Home Purchase", emoji: "🏡" },
  { value: "wedding", label: "Wedding", emoji: "💍" },
  { value: "education", label: "Education", emoji: "📚" },
  { value: "retirement", label: "Retirement", emoji: "🌅" },
  { value: "debt_payoff", label: "Debt Payoff", emoji: "💳" },
  { value: "other", label: "Other", emoji: "🎯" },
];

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await goalsApi.list();
      setGoals(res.data);
    } finally {
      setLoading(false);
    }
  }

  const active = goals.filter((g) => g.status === "active");
  const completed = goals.filter((g) => g.status === "completed");

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Goals</h1>
          <p className="text-sm text-gray-500 mt-1">Track your household savings goals and milestones</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={16} /> New goal
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="shimmer h-48 rounded-2xl" />)}
        </div>
      ) : active.length === 0 && completed.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-20 text-center">
          <div className="text-5xl mb-4">🎯</div>
          <h3 className="font-semibold text-gray-900 mb-2">No goals yet</h3>
          <p className="text-sm text-gray-500">Set a savings goal to stay motivated</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary mt-4"><Plus size={15} /> Create goal</button>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Active</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {active.map((goal) => <GoalCard key={goal.id} goal={goal} onRefresh={load} />)}
              </div>
            </div>
          )}
          {completed.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Completed 🎉</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {completed.map((goal) => <GoalCard key={goal.id} goal={goal} onRefresh={load} />)}
              </div>
            </div>
          )}
        </>
      )}

      {showCreate && (
        <CreateGoalModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />
      )}
    </div>
  );
}

function GoalCard({ goal, onRefresh }: { goal: Goal; onRefresh: () => void }) {
  const [contributing, setContributing] = useState(false);
  const [amount, setAmount] = useState("");

  const pct = Math.min(goal.progress_pct, 100);
  const remaining = goal.target_amount - goal.current_amount;
  const typeConfig = GOAL_TYPES.find((t) => t.value === goal.type) ?? { emoji: "🎯", label: goal.type };

  async function contribute() {
    if (!amount || parseFloat(amount) <= 0) return;
    await goalsApi.contribute(goal.id, {
      amount: parseFloat(amount),
      contributed_at: new Date().toISOString().split("T")[0],
    });
    setAmount("");
    setContributing(false);
    onRefresh();
  }

  return (
    <div className="card card-hover">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{goal.emoji ?? typeConfig.emoji}</span>
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">{goal.name}</h3>
            <p className="text-xs text-gray-400">{typeConfig.label}</p>
          </div>
        </div>
        {goal.status === "completed" && (
          <span className="badge bg-emerald-100 text-emerald-700">Completed</span>
        )}
      </div>

      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span className="font-semibold text-gray-900 text-base tabular">{formatCurrency(goal.current_amount)}</span>
          <span className="text-gray-400">of {formatCurrency(goal.target_amount)}</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: goal.color ?? "#14b8a6" }}
          />
        </div>
        <div className="flex justify-between mt-1.5 text-xs">
          <span className="font-medium" style={{ color: goal.color ?? "#14b8a6" }}>{pct.toFixed(0)}%</span>
          <span className="text-gray-400">{formatCurrency(remaining)} to go</span>
        </div>
      </div>

      <div className="flex gap-3 text-xs text-gray-500 mb-4">
        {goal.target_date && (
          <div className="flex items-center gap-1">
            <Calendar size={11} />
            <span>{formatDate(goal.target_date)}</span>
          </div>
        )}
        {goal.monthly_contribution && (
          <div className="flex items-center gap-1">
            <TrendingUp size={11} />
            <span>{formatCurrency(goal.monthly_contribution)}/mo</span>
          </div>
        )}
      </div>

      {goal.status === "active" && (
        contributing ? (
          <div className="flex gap-2">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
              className="input py-1.5 text-xs flex-1"
              autoFocus
            />
            <button onClick={contribute} className="btn-primary py-1.5 px-3 text-xs">Add</button>
            <button onClick={() => setContributing(false)} className="btn-secondary py-1.5 px-3 text-xs">Cancel</button>
          </div>
        ) : (
          <button
            onClick={() => setContributing(true)}
            className="btn-secondary w-full text-xs py-2"
          >
            <Plus size={13} /> Add contribution
          </button>
        )
      )}
    </div>
  );
}

function CreateGoalModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: "",
    type: "savings",
    target_amount: "",
    current_amount: "0",
    monthly_contribution: "",
    target_date: "",
    emoji: "",
    scope: "household",
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await goalsApi.create({
        ...form,
        target_amount: parseFloat(form.target_amount),
        current_amount: parseFloat(form.current_amount || "0"),
        monthly_contribution: form.monthly_contribution ? parseFloat(form.monthly_contribution) : undefined,
        target_date: form.target_date || undefined,
        emoji: form.emoji || GOAL_TYPES.find((t) => t.value === form.type)?.emoji,
      });
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md shadow-card-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-gray-900 mb-4">New Goal</h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Goal name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Italy Trip 2027" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Type</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {GOAL_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Target ($)</label>
              <input type="number" className="input" value={form.target_amount} onChange={(e) => setForm({ ...form, target_amount: e.target.value })} min="0" step="100" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Current ($)</label>
              <input type="number" className="input" value={form.current_amount} onChange={(e) => setForm({ ...form, current_amount: e.target.value })} min="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Monthly ($)</label>
              <input type="number" className="input" value={form.monthly_contribution} onChange={(e) => setForm({ ...form, monthly_contribution: e.target.value })} min="0" placeholder="Optional" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Target date</label>
              <input type="date" className="input" value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? "Creating…" : "Create goal"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
