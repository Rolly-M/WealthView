"use client";

import { useEffect, useState } from "react";
import { Search, Filter, ChevronDown, ArrowUpDown } from "lucide-react";
import { transactionsApi } from "@/lib/api";
import { formatCurrency, formatDate, getCategoryConfig, cn } from "@/lib/utils";
import type { Transaction } from "@/types";

const CATEGORIES = [
  "housing","groceries","dining","transportation","utilities","insurance",
  "debt_payment","savings","investing","entertainment","health","shopping",
  "income","transfer","subscription","travel","education","personal_care",
  "gifts","miscellaneous",
];

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [editId, setEditId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState("");

  useEffect(() => {
    load();
  }, [search, category, page]);

  async function load() {
    setLoading(true);
    try {
      const params: any = { page, page_size: 50 };
      if (search) params.search = search;
      if (category) params.category = category;
      const res = await transactionsApi.list(params);
      setTransactions(res.data);
    } finally {
      setLoading(false);
    }
  }

  async function saveCategory(id: string) {
    await transactionsApi.update(id, { category: editCategory });
    setEditId(null);
    load();
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
        <p className="text-sm text-gray-500 mt-1">All household transactions, auto-classified</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search merchant or description…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="input pl-9"
          />
        </div>
        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          className="input w-44"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{getCategoryConfig(c).label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Date</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Merchant</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Category</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500">Amount</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-5 py-3.5">
                          <div className="shimmer h-4 rounded w-3/4" />
                        </td>
                      ))}
                    </tr>
                  ))
                : transactions.map((txn) => {
                    const cfg = getCategoryConfig(txn.category);
                    const isEdit = editId === txn.id;
                    return (
                      <tr key={txn.id} className="hover:bg-gray-50 transition-colors group">
                        <td className="px-5 py-3.5 text-gray-500 text-xs whitespace-nowrap">
                          {formatDate(txn.date)}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="font-medium text-gray-900">{txn.merchant_normalized || txn.description}</div>
                          {txn.is_recurring && (
                            <span className="badge bg-purple-50 text-purple-600 mt-0.5">Recurring</span>
                          )}
                          {txn.is_subscription && (
                            <span className="badge bg-indigo-50 text-indigo-600 mt-0.5">Subscription</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          {isEdit ? (
                            <div className="flex items-center gap-2">
                              <select
                                value={editCategory}
                                onChange={(e) => setEditCategory(e.target.value)}
                                className="input py-1 text-xs w-36"
                                autoFocus
                              >
                                {CATEGORIES.map((c) => (
                                  <option key={c} value={c}>{getCategoryConfig(c).label}</option>
                                ))}
                              </select>
                              <button onClick={() => saveCategory(txn.id)} className="text-brand-600 text-xs font-medium">Save</button>
                              <button onClick={() => setEditId(null)} className="text-gray-400 text-xs">Cancel</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setEditId(txn.id); setEditCategory(txn.category); }}
                              className="flex items-center gap-1.5 group/cat"
                            >
                              <span className="text-sm">{cfg.emoji}</span>
                              <span
                                className="badge"
                                style={{ background: `${cfg.color}18`, color: cfg.color }}
                              >
                                {cfg.label}
                              </span>
                              <ChevronDown size={10} className="text-gray-300 opacity-0 group-hover/cat:opacity-100" />
                            </button>
                          )}
                        </td>
                        <td className={cn(
                          "px-5 py-3.5 text-right font-semibold tabular",
                          txn.is_income ? "text-emerald-600" : "text-gray-900"
                        )}>
                          {txn.is_income ? "+" : ""}{formatCurrency(Math.abs(txn.amount))}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={cn(
                            "badge text-[10px]",
                            txn.category_source === "user" && "bg-brand-50 text-brand-700",
                            txn.category_source === "ml" && "bg-gray-100 text-gray-600",
                            txn.category_source === "rule" && "bg-amber-50 text-amber-700",
                          )}>
                            {txn.category_source === "ml" ? "Auto" :
                             txn.category_source === "user" ? "Manual" :
                             txn.category_source === "rule" ? "Rule" : "Provider"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
          {!loading && transactions.length === 0 && (
            <div className="py-16 text-center text-gray-400 text-sm">
              No transactions found
            </div>
          )}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
          <span className="text-xs text-gray-400">{transactions.length} transactions</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-secondary py-1.5 px-3 text-xs"
            >
              Previous
            </button>
            <span className="px-3 py-1.5 text-xs text-gray-500">Page {page}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={transactions.length < 50}
              className="btn-secondary py-1.5 px-3 text-xs"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
