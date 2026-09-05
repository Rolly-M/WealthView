"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Table2, Download } from "lucide-react";
import { budgetsApi, trackingSheetsApi } from "@/lib/api";
import { formatCurrency, formatSignedCurrency, getCategoryConfig, CATEGORY_CONFIG, cn } from "@/lib/utils";
import type { Budget, BudgetProgress, TrackingSheet, TrackingSheetItem } from "@/types";

export default function BudgetsPage() {
  const [tab, setTab] = useState<"budgets" | "tracking">("budgets");

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Budgets</h1>
          <p className="text-sm text-gray-500 mt-1">Track spending against your household budgets</p>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {([
          { key: "budgets", label: "Budgets" },
          { key: "tracking", label: "Tracking Sheet" },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "px-3 py-2 rounded-lg text-sm font-medium transition-all",
              tab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "budgets" ? <BudgetsTab /> : <TrackingSheetTab />}
    </div>
  );
}

function BudgetsTab() {
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
    <div className="space-y-4">
      <div className="flex justify-end">
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

// ─── Tracking Sheet ─────────────────────────────────────────────────────────
// A manually-filled monthly ledger of recurring expenses — distinct from the
// budgets above, which auto-compute spend from linked Plaid transactions.
// The point here is typing in every recurring dollar (rent, subscriptions,
// insurance, loan payments…) so a couple can see exactly where it all goes,
// budgeted vs. actual, month by month, with nothing auto-erased.
function monthLabel(month: number, year: number) {
  return new Date(year, month - 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

function TrackingSheetTab() {
  const [sheets, setSheets] = useState<TrackingSheet[]>([]);
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<TrackingSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [showNewSheet, setShowNewSheet] = useState(false);

  useEffect(() => { loadSheets(); }, []);

  async function loadSheets(selectId?: string) {
    setLoading(true);
    try {
      const res = await trackingSheetsApi.list();
      setSheets(res.data);
      setActiveSheetId(selectId ?? res.data[0]?.id ?? null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!activeSheetId) { setSheet(null); return; }
    setSheetLoading(true);
    trackingSheetsApi.get(activeSheetId).then((res) => setSheet(res.data)).finally(() => setSheetLoading(false));
  }, [activeSheetId]);

  async function refreshActiveSheet() {
    const [sheetsRes, sheetRes] = await Promise.all([
      trackingSheetsApi.list(),
      activeSheetId ? trackingSheetsApi.get(activeSheetId) : Promise.resolve(null),
    ]);
    setSheets(sheetsRes.data);
    if (sheetRes) setSheet(sheetRes.data);
  }

  async function deleteSheet() {
    if (!sheet) return;
    if (!confirm(`Delete the ${monthLabel(sheet.month, sheet.year)} sheet? This can't be undone.`)) return;
    await trackingSheetsApi.delete(sheet.id);
    setActiveSheetId(null);
    loadSheets();
  }

  if (loading) return <div className="shimmer h-64 rounded-2xl" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <select
          className="input w-auto"
          value={activeSheetId ?? ""}
          onChange={(e) => setActiveSheetId(e.target.value || null)}
        >
          {sheets.length === 0 && <option value="">No sheets yet</option>}
          {sheets.map((s) => (
            <option key={s.id} value={s.id}>{s.name || monthLabel(s.month, s.year)}</option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          {sheet && (
            <>
              <a href={`/api/tracking-sheets/${sheet.id}/export`} className="btn-secondary text-xs py-2">
                <Download size={14} /> Export CSV
              </a>
              <button onClick={deleteSheet} className="text-xs py-2 px-3 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 flex items-center gap-1.5 transition-colors">
                <Trash2 size={14} /> Delete sheet
              </button>
            </>
          )}
          <button onClick={() => setShowNewSheet(true)} className="btn-primary text-xs py-2">
            <Plus size={14} /> New sheet
          </button>
        </div>
      </div>

      {!sheet ? (
        <div className="card flex flex-col items-center justify-center py-20 text-center">
          <Table2 size={40} className="text-gray-300 mb-4" />
          <h3 className="font-semibold text-gray-900 mb-2">No tracking sheet yet</h3>
          <p className="text-sm text-gray-500 max-w-xs">
            Create a monthly sheet to log every recurring expense — rent, subscriptions, insurance — and see exactly where each dollar goes.
          </p>
          <button onClick={() => setShowNewSheet(true)} className="btn-primary mt-4">
            <Plus size={15} /> Create sheet
          </button>
        </div>
      ) : sheetLoading ? (
        <div className="shimmer h-64 rounded-2xl" />
      ) : (
        <TrackingSheetGrid sheet={sheet} allSheets={sheets} onChange={refreshActiveSheet} />
      )}

      {showNewSheet && (
        <NewSheetModal
          existingSheets={sheets}
          onClose={() => setShowNewSheet(false)}
          onCreated={(id) => { setShowNewSheet(false); loadSheets(id); }}
        />
      )}
    </div>
  );
}

function TrackingSheetGrid({
  sheet, allSheets, onChange,
}: {
  sheet: TrackingSheet; allSheets: TrackingSheet[]; onChange: () => void;
}) {
  const [items, setItems] = useState<TrackingSheetItem[]>(sheet.items ?? []);
  const [adding, setAdding] = useState(false);

  useEffect(() => { setItems(sheet.items ?? []); }, [sheet]);

  function patchLocal(id: string, patch: Partial<TrackingSheetItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  async function saveItem(id: string, patch: Partial<TrackingSheetItem>) {
    await trackingSheetsApi.updateItem(sheet.id, id, patch);
    onChange();
  }

  async function addRow() {
    setAdding(true);
    try {
      const res = await trackingSheetsApi.addItem(sheet.id, {
        category: "miscellaneous", description: "", budgeted_amount: 0, actual_amount: 0,
      });
      setItems((prev) => [...prev, res.data]);
      onChange();
    } finally {
      setAdding(false);
    }
  }

  async function deleteRow(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await trackingSheetsApi.deleteItem(sheet.id, id);
    onChange();
  }

  const totalBudgeted = items.reduce((s, i) => s + Number(i.budgeted_amount), 0);
  const totalActual = items.reduce((s, i) => s + Number(i.actual_amount), 0);
  const diff = totalBudgeted - totalActual;

  const prevMonth = sheet.month === 1 ? 12 : sheet.month - 1;
  const prevYear = sheet.month === 1 ? sheet.year - 1 : sheet.year;
  const prevSheet = allSheets.find((s) => s.month === prevMonth && s.year === prevYear);
  const vsLastMonth = prevSheet ? totalActual - (prevSheet.total_actual ?? 0) : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <InsightCard label="Total budgeted" value={formatCurrency(totalBudgeted)} />
        <InsightCard label="Total actual" value={formatCurrency(totalActual)} />
        <InsightCard label="Difference" value={formatSignedCurrency(diff)} tone={diff >= 0 ? "good" : "bad"} />
        {vsLastMonth !== null && (
          <InsightCard
            label={`vs ${monthLabel(prevMonth, prevYear)}`}
            value={formatSignedCurrency(vsLastMonth)}
            tone={vsLastMonth <= 0 ? "good" : "bad"}
          />
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
              <th className="pb-2 pr-2 font-medium">Category</th>
              <th className="pb-2 pr-2 font-medium">Description</th>
              <th className="pb-2 pr-2 font-medium text-right">Budgeted</th>
              <th className="pb-2 pr-2 font-medium text-right">Actual</th>
              <th className="pb-2 pr-2 font-medium text-right">Difference</th>
              <th className="pb-2 pr-2 font-medium">Notes</th>
              <th className="pb-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const itemDiff = Number(item.budgeted_amount) - Number(item.actual_amount);
              return (
                <tr key={item.id} className="border-b border-gray-50 last:border-0">
                  <td className="py-1.5 pr-2">
                    <select
                      className="input !py-1.5 !text-xs"
                      value={item.category}
                      onChange={(e) => { patchLocal(item.id, { category: e.target.value }); saveItem(item.id, { category: e.target.value }); }}
                    >
                      {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                        <option key={key} value={key}>{cfg.emoji} {cfg.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      className="input !py-1.5 !text-xs"
                      value={item.description}
                      onChange={(e) => patchLocal(item.id, { description: e.target.value })}
                      onBlur={(e) => saveItem(item.id, { description: e.target.value })}
                      placeholder="e.g. Rent"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      type="number" step="0.01"
                      className="input !py-1.5 !text-xs text-right"
                      value={item.budgeted_amount}
                      onChange={(e) => patchLocal(item.id, { budgeted_amount: Number(e.target.value) })}
                      onBlur={(e) => saveItem(item.id, { budgeted_amount: Number(e.target.value) })}
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      type="number" step="0.01"
                      className="input !py-1.5 !text-xs text-right"
                      value={item.actual_amount}
                      onChange={(e) => patchLocal(item.id, { actual_amount: Number(e.target.value) })}
                      onBlur={(e) => saveItem(item.id, { actual_amount: Number(e.target.value) })}
                    />
                  </td>
                  <td className={cn("py-1.5 pr-2 text-right text-xs font-medium tabular", itemDiff < 0 ? "text-red-600" : "text-emerald-600")}>
                    {formatSignedCurrency(itemDiff)}
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      className="input !py-1.5 !text-xs"
                      value={item.notes ?? ""}
                      onChange={(e) => patchLocal(item.id, { notes: e.target.value })}
                      onBlur={(e) => saveItem(item.id, { notes: e.target.value })}
                      placeholder="optional"
                    />
                  </td>
                  <td className="py-1.5">
                    <button onClick={() => deleteRow(item.id)} className="p-1 rounded text-gray-300 hover:text-red-500">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {items.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-100 font-semibold text-xs">
                <td className="pt-2" colSpan={2}>Total</td>
                <td className="pt-2 text-right tabular">{formatCurrency(totalBudgeted)}</td>
                <td className="pt-2 text-right tabular">{formatCurrency(totalActual)}</td>
                <td className={cn("pt-2 text-right tabular", diff < 0 ? "text-red-600" : "text-emerald-600")}>
                  {formatSignedCurrency(diff)}
                </td>
                <td className="pt-2" colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>

        {items.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-8">No line items yet — add your recurring expenses below.</p>
        )}

        <button onClick={addRow} disabled={adding} className="btn-secondary text-xs py-2 mt-3">
          <Plus size={13} /> {adding ? "Adding…" : "Add expense"}
        </button>
      </div>
    </div>
  );
}

function InsightCard({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="card py-3">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={cn(
        "text-lg font-bold tabular",
        tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : "text-gray-900"
      )}>
        {value}
      </p>
    </div>
  );
}

function NewSheetModal({
  existingSheets, onClose, onCreated,
}: {
  existingSheets: TrackingSheet[]; onClose: () => void; onCreated: (id: string) => void;
}) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [cloneFromId, setCloneFromId] = useState(existingSheets[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await trackingSheetsApi.create({
        month, year,
        clone_from_sheet_id: cloneFromId || undefined,
      });
      onCreated(res.data.id);
    } catch (err: unknown) {
      setError((err as Error)?.message ?? "Failed to create sheet");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md shadow-card-lg">
        <h2 className="text-lg font-bold text-gray-900 mb-4">New tracking sheet</h2>
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Month</label>
              <select className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(2000, i).toLocaleString("en-US", { month: "long" })}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Year</label>
              <input type="number" className="input" value={year} onChange={(e) => setYear(Number(e.target.value))} />
            </div>
          </div>
          {existingSheets.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Start from</label>
              <select className="input" value={cloneFromId} onChange={(e) => setCloneFromId(e.target.value)}>
                <option value="">Blank sheet</option>
                {existingSheets.map((s) => (
                  <option key={s.id} value={s.id}>Copy line items from {monthLabel(s.month, s.year)}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Carries over your recurring expenses so you don&apos;t retype them — actuals reset to $0.
              </p>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? "Creating…" : "Create sheet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
