"use client";

import { useEffect, useState } from "react";
import { BookmarkPlus, BookmarkCheck, Info, TrendingUp, TrendingDown, ExternalLink, Filter } from "lucide-react";
import { etfApi } from "@/lib/api";
import { cn, formatCurrency } from "@/lib/utils";
import type { ETFSecurity } from "@/types";

function pct(v?: number | null, decimals = 2) {
  if (v == null) return "—";
  return `${(v * 100).toFixed(decimals)}%`;
}
function fmt(v?: number | null, prefix = "") {
  if (v == null) return "—";
  return `${prefix}${v.toFixed(2)}`;
}

export default function InvestmentsPage() {
  const [etfs, setEtfs] = useState<ETFSecurity[]>([]);
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ETFSecurity | null>(null);
  const [filters, setFilters] = useState({ minYield: "", maxExpense: "", search: "", category: "" });
  const [tab, setTab] = useState<"featured" | "screener">("featured");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [etfRes, wlRes] = await Promise.allSettled([
        etfApi.featured(),
        etfApi.watchlist(),
      ]);
      if (etfRes.status === "fulfilled") setEtfs(etfRes.value.data);
      if (wlRes.status === "fulfilled") {
        setWatchlist(new Set(wlRes.value.data.map((item: any) => item.security.ticker)));
      }
    } finally {
      setLoading(false);
    }
  }

  async function screen() {
    setLoading(true);
    try {
      const params: any = {};
      if (filters.minYield) params.min_yield = parseFloat(filters.minYield) / 100;
      if (filters.maxExpense) params.max_expense_ratio = parseFloat(filters.maxExpense) / 100;
      if (filters.search) params.search = filters.search;
      if (filters.category) params.category = filters.category;
      const res = await etfApi.screen(params);
      setEtfs(res.data);
    } finally {
      setLoading(false);
    }
  }

  async function toggleWatchlist(ticker: string) {
    if (watchlist.has(ticker)) {
      await etfApi.removeFromWatchlist(ticker);
      setWatchlist((prev) => { const s = new Set(prev); s.delete(ticker); return s; });
    } else {
      await etfApi.addToWatchlist(ticker);
      setWatchlist((prev) => new Set([...prev, ticker]));
    }
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Investment Research</h1>
        <p className="text-sm text-gray-500 mt-1">
          Screen and research high-dividend ETFs with growth characteristics.
          <span className="ml-2 text-xs text-amber-600 font-medium">
            ⚠️ For research purposes only — not personalized investment advice.
          </span>
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {(["featured", "screener"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); if (t === "featured") loadAll(); }}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all",
              tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            )}
          >
            {t === "featured" ? "Top Picks" : "Screener"}
          </button>
        ))}
      </div>

      {tab === "screener" && (
        <div className="card">
          <h3 className="font-semibold text-sm text-gray-900 mb-3 flex items-center gap-2">
            <Filter size={15} /> Filters
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Min yield (%)</label>
              <input type="number" className="input py-1.5 text-xs" value={filters.minYield}
                onChange={(e) => setFilters({ ...filters, minYield: e.target.value })} placeholder="e.g. 3.5" step="0.1" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Max expense (%)</label>
              <input type="number" className="input py-1.5 text-xs" value={filters.maxExpense}
                onChange={(e) => setFilters({ ...filters, maxExpense: e.target.value })} placeholder="e.g. 0.50" step="0.01" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
              <input type="text" className="input py-1.5 text-xs" value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Ticker or name" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
              <select className="input py-1.5 text-xs" value={filters.category}
                onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
                <option value="">All</option>
                <option value="High Dividend">High Dividend</option>
                <option value="Dividend Growth">Dividend Growth</option>
              </select>
            </div>
          </div>
          <button onClick={screen} className="btn-primary mt-3 text-sm py-2">Apply filters</button>
        </div>
      )}

      {/* Research disclaimer */}
      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 leading-relaxed">
        <strong>Research Disclaimer:</strong> ETF data shown is for educational and research purposes only. Yields, returns,
        and other metrics reflect historical data and do not guarantee future performance. WealthView Duo does not provide
        personalized investment advice. Always consult a licensed financial advisor before making investment decisions.
        Data sourced from mock provider in demo mode. In production, connect a live market data provider.
      </div>

      {/* ETF cards */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="shimmer h-48 rounded-2xl" />)}
        </div>
      ) : etfs.length === 0 ? (
        <div className="card py-16 text-center text-gray-400">
          <p>No ETFs found for your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {etfs.map((etf) => (
            <ETFCard
              key={etf.ticker}
              etf={etf}
              inWatchlist={watchlist.has(etf.ticker)}
              onToggleWatchlist={() => toggleWatchlist(etf.ticker)}
              onSelect={() => setSelected(etf)}
            />
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <ETFDetailModal
          etf={selected}
          inWatchlist={watchlist.has(selected.ticker)}
          onToggleWatchlist={() => toggleWatchlist(selected.ticker)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function ETFCard({
  etf, inWatchlist, onToggleWatchlist, onSelect
}: {
  etf: ETFSecurity; inWatchlist: boolean; onToggleWatchlist: () => void; onSelect: () => void;
}) {
  const m = etf.latest_metrics;
  const yieldVal = m?.dividend_yield ? (Number(m.dividend_yield) * 100) : null;
  const ret1y = m?.return_1y ? (Number(m.return_1y) * 100) : null;

  return (
    <div className="card card-hover cursor-pointer group" onClick={onSelect}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-gray-900">{etf.ticker}</span>
            {etf.tags.includes("featured") && (
              <span className="badge bg-brand-100 text-brand-700 text-[10px]">Top Pick</span>
            )}
            {etf.tags.includes("dividend-growth") && (
              <span className="badge bg-purple-100 text-purple-700 text-[10px]">Growth</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{etf.name}</p>
          <p className="text-[11px] text-gray-400">{etf.issuer} · {etf.exchange} · {etf.currency}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleWatchlist(); }}
          className={cn(
            "p-2 rounded-xl transition-all",
            inWatchlist ? "text-brand-600 bg-brand-50" : "text-gray-400 hover:text-brand-600 hover:bg-brand-50"
          )}
        >
          {inWatchlist ? <BookmarkCheck size={16} /> : <BookmarkPlus size={16} />}
        </button>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="text-center p-2 rounded-xl bg-gray-50">
          <p className="text-[10px] text-gray-400 mb-0.5">Yield</p>
          <p className="text-sm font-bold text-emerald-600">{yieldVal ? `${yieldVal.toFixed(2)}%` : "—"}</p>
        </div>
        <div className="text-center p-2 rounded-xl bg-gray-50">
          <p className="text-[10px] text-gray-400 mb-0.5">Expense</p>
          <p className="text-sm font-bold text-gray-900">{m?.expense_ratio ? pct(Number(m.expense_ratio), 2) : "—"}</p>
        </div>
        <div className="text-center p-2 rounded-xl bg-gray-50">
          <p className="text-[10px] text-gray-400 mb-0.5">1Y Return</p>
          <p className={cn("text-sm font-bold", ret1y && ret1y >= 0 ? "text-emerald-600" : "text-red-500")}>
            {ret1y != null ? `${ret1y >= 0 ? "+" : ""}${ret1y.toFixed(1)}%` : "—"}
          </p>
        </div>
      </div>

      {/* Why featured */}
      {m?.why_featured && (
        <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed">{m.why_featured}</p>
      )}

      <div className="flex items-center justify-between mt-3">
        <div className="flex gap-3 text-[10px] text-gray-400">
          {m?.aum_millions && <span>AUM ${Number(m.aum_millions).toFixed(0)}M</span>}
          {m?.holdings_count && <span>{m.holdings_count} holdings</span>}
        </div>
        <button className="text-[11px] text-brand-600 font-medium group-hover:underline flex items-center gap-1">
          View details <ExternalLink size={10} />
        </button>
      </div>
    </div>
  );
}

function ETFDetailModal({
  etf, inWatchlist, onToggleWatchlist, onClose
}: {
  etf: ETFSecurity; inWatchlist: boolean; onToggleWatchlist: () => void; onClose: () => void;
}) {
  const m = etf.latest_metrics;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center overflow-y-auto py-8 px-4">
      <div className="card w-full max-w-2xl shadow-card-lg">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-2xl font-bold text-gray-900">{etf.ticker}</h2>
              <button
                onClick={onToggleWatchlist}
                className={cn("btn-secondary text-xs py-1.5", inWatchlist && "text-brand-600 border-brand-300")}
              >
                {inWatchlist ? <><BookmarkCheck size={13} /> Saved</> : <><BookmarkPlus size={13} /> Save</>}
              </button>
            </div>
            <p className="text-sm text-gray-600">{etf.name}</p>
            <p className="text-xs text-gray-400">{etf.issuer} · {etf.exchange} · {etf.currency} · {etf.category}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-light">✕</button>
        </div>

        {/* Disclaimer */}
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700 mb-5">
          Research purposes only. Not personalized investment advice. Past performance does not predict future results.
        </div>

        {/* Why featured */}
        {m?.why_featured && (
          <div className="p-4 rounded-xl bg-brand-50 border border-brand-100 mb-5">
            <p className="text-xs font-semibold text-brand-700 mb-1">Why this ETF appears</p>
            <p className="text-sm text-brand-800 leading-relaxed">{m.why_featured}</p>
          </div>
        )}

        {/* Metrics grid */}
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Div Yield (TTM)", value: pct(Number(m?.dividend_yield_ttm)) },
            { label: "Expense Ratio", value: pct(Number(m?.expense_ratio)) },
            { label: "1Y Return", value: pct(Number(m?.return_1y)) },
            { label: "3Y Ann.", value: pct(Number(m?.return_3y_annualized)) },
            { label: "5Y Ann.", value: pct(Number(m?.return_5y_annualized)) },
            { label: "Div Growth 1Y", value: pct(Number(m?.dividend_growth_1y)) },
            { label: "Div Growth 3Y", value: pct(Number(m?.dividend_growth_3y)) },
            { label: "Sharpe 1Y", value: fmt(Number(m?.sharpe_ratio_1y)) },
            { label: "Beta", value: fmt(Number(m?.beta)) },
            { label: "P/E", value: fmt(Number(m?.pe_ratio)) },
            { label: "AUM", value: m?.aum_millions ? `$${Number(m.aum_millions).toFixed(0)}M` : "—" },
            { label: "Price", value: m?.price ? formatCurrency(Number(m.price)) : "—" },
          ].map(({ label, value }) => (
            <div key={label} className="p-2.5 rounded-xl bg-gray-50 text-center">
              <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
              <p className="text-sm font-semibold text-gray-900">{value}</p>
            </div>
          ))}
        </div>

        {/* Sector allocation */}
        {m?.sector_allocation && Object.keys(m.sector_allocation).length > 0 && (
          <div className="mb-5">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Sector Allocation</h4>
            <div className="space-y-2">
              {Object.entries(m.sector_allocation)
                .sort((a, b) => Number(b[1]) - Number(a[1]))
                .map(([sector, pct_val]) => (
                  <div key={sector}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-700">{sector}</span>
                      <span className="font-medium text-gray-900">{Number(pct_val).toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct_val}%` }} />
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Top holdings */}
        {m?.top_holdings && m.top_holdings.length > 0 && (
          <div className="mb-5">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Top Holdings</h4>
            <div className="space-y-1.5">
              {m.top_holdings.map((h: any) => (
                <div key={h.name} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{h.name}</span>
                  <span className="font-medium text-gray-900">{(h.weight * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Research notes */}
        {m?.research_notes && (
          <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
            <p className="text-xs font-semibold text-gray-500 mb-1">Research Notes</p>
            <p className="text-sm text-gray-600 leading-relaxed">{m.research_notes}</p>
          </div>
        )}

        {m?.as_of_date && (
          <p className="text-[10px] text-gray-400 text-right mt-4">
            Data as of {m.as_of_date} · Source: {etf.tags.includes("mock") || !etf.tags.includes("live") ? "Demo (mock data)" : "Live market feed"}
          </p>
        )}
      </div>
    </div>
  );
}
