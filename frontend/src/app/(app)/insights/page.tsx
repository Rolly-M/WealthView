"use client";

import { useEffect, useState } from "react";
import { RefreshCw, CheckCircle, X, Bookmark, BookmarkCheck } from "lucide-react";
import { insightsApi } from "@/lib/api";
import { severityIcon, severityColor, formatCurrency, cn } from "@/lib/utils";
import type { Insight } from "@/types";

export default function InsightsPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);

  useEffect(() => { load(); }, [showDismissed]);

  async function load() {
    setLoading(true);
    try {
      const res = await insightsApi.list({ include_dismissed: showDismissed, limit: 30 });
      setInsights(res.data);
    } finally {
      setLoading(false);
    }
  }

  async function act(id: string, action: "read" | "dismiss" | "save") {
    await insightsApi.action(id, action);
    setInsights((prev) =>
      prev.map((ins) =>
        ins.id === id
          ? {
              ...ins,
              is_read: action === "read" ? true : ins.is_read,
              is_dismissed: action === "dismiss" ? true : ins.is_dismissed,
              is_saved: action === "save" ? !ins.is_saved : ins.is_saved,
            }
          : ins
      )
    );
  }

  async function generate() {
    setGenerating(true);
    try {
      await insightsApi.generate();
      await load();
    } finally {
      setGenerating(false);
    }
  }

  const visible = showDismissed ? insights : insights.filter((i) => !i.is_dismissed);
  const unread = insights.filter((i) => !i.is_read && !i.is_dismissed).length;

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            Insights
            {unread > 0 && (
              <span className="badge bg-brand-100 text-brand-700">{unread} new</span>
            )}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Proactive observations about your household finances
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowDismissed(!showDismissed)}
            className="btn-secondary text-xs"
          >
            {showDismissed ? "Hide dismissed" : "Show dismissed"}
          </button>
          <button onClick={generate} disabled={generating} className="btn-primary">
            <RefreshCw size={15} className={generating ? "animate-spin" : ""} />
            Generate
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="shimmer h-24 rounded-2xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-20 text-center">
          <div className="text-5xl mb-4">💡</div>
          <h3 className="text-base font-semibold text-gray-900 mb-2">No insights yet</h3>
          <p className="text-sm text-gray-500 max-w-xs">
            Insights are generated automatically after account syncs, or you can trigger them manually.
          </p>
          <button onClick={generate} disabled={generating} className="btn-primary mt-4">
            <RefreshCw size={15} className={generating ? "animate-spin" : ""} />
            Generate now
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((ins) => (
            <div
              key={ins.id}
              className={cn(
                "card border p-5 transition-opacity",
                severityColor(ins.severity),
                ins.is_dismissed && "opacity-50",
                !ins.is_read && "ring-1 ring-inset ring-current/10",
              )}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl flex-shrink-0 mt-0.5">{severityIcon(ins.severity)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-sm">{ins.title}</h3>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => act(ins.id, "save")}
                        className="p-1 rounded-lg hover:bg-black/5 transition-colors"
                        title={ins.is_saved ? "Unsave" : "Save"}
                      >
                        {ins.is_saved ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
                      </button>
                      {!ins.is_dismissed && (
                        <button
                          onClick={() => act(ins.id, "dismiss")}
                          className="p-1 rounded-lg hover:bg-black/5 transition-colors"
                          title="Dismiss"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm mt-1 opacity-80 leading-relaxed">{ins.body}</p>
                  {ins.amount !== null && ins.amount !== undefined && (
                    <div className="flex items-center gap-4 mt-2 text-xs opacity-70">
                      <span>Amount: <strong>{formatCurrency(ins.amount)}</strong></span>
                      {ins.pct_change !== null && ins.pct_change !== undefined && (
                        <span>Change: <strong>{ins.pct_change > 0 ? "+" : ""}{ins.pct_change.toFixed(1)}%</strong></span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-4 mt-3">
                    {!ins.is_read && (
                      <button
                        onClick={() => act(ins.id, "read")}
                        className="flex items-center gap-1 text-xs font-medium opacity-70 hover:opacity-100 transition-opacity"
                      >
                        <CheckCircle size={12} /> Mark read
                      </button>
                    )}
                    <span className="text-xs opacity-50">
                      {new Date(ins.created_at).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                      })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
