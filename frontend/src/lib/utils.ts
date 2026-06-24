import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(
  amount: number,
  currency = "USD",
  locale = "en-US"
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}%`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return formatShortDate(dateStr);
}

export const CATEGORY_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
  housing: { label: "Housing", color: "#6366f1", emoji: "🏠" },
  groceries: { label: "Groceries", color: "#10b981", emoji: "🛒" },
  dining: { label: "Dining", color: "#f59e0b", emoji: "🍽️" },
  transportation: { label: "Transportation", color: "#3b82f6", emoji: "🚗" },
  utilities: { label: "Utilities", color: "#8b5cf6", emoji: "⚡" },
  insurance: { label: "Insurance", color: "#64748b", emoji: "🛡️" },
  debt_payment: { label: "Debt Payment", color: "#ef4444", emoji: "💳" },
  savings: { label: "Savings", color: "#14b8a6", emoji: "💰" },
  investing: { label: "Investing", color: "#0d9488", emoji: "📈" },
  entertainment: { label: "Entertainment", color: "#ec4899", emoji: "🎬" },
  health: { label: "Health", color: "#22c55e", emoji: "❤️" },
  shopping: { label: "Shopping", color: "#f97316", emoji: "🛍️" },
  income: { label: "Income", color: "#16a34a", emoji: "💵" },
  transfer: { label: "Transfer", color: "#94a3b8", emoji: "↔️" },
  subscription: { label: "Subscription", color: "#a855f7", emoji: "🔔" },
  travel: { label: "Travel", color: "#0ea5e9", emoji: "✈️" },
  education: { label: "Education", color: "#d97706", emoji: "📚" },
  personal_care: { label: "Personal Care", color: "#e879f9", emoji: "💅" },
  gifts: { label: "Gifts", color: "#fb7185", emoji: "🎁" },
  miscellaneous: { label: "Misc", color: "#9ca3af", emoji: "📌" },
};

export function getCategoryConfig(category: string) {
  return CATEGORY_CONFIG[category] ?? { label: category, color: "#9ca3af", emoji: "📌" };
}

export function severityColor(severity: string): string {
  return {
    info: "bg-blue-50 border-blue-200 text-blue-800",
    warning: "bg-amber-50 border-amber-200 text-amber-800",
    positive: "bg-emerald-50 border-emerald-200 text-emerald-800",
    critical: "bg-red-50 border-red-200 text-red-800",
  }[severity] ?? "bg-gray-50 border-gray-200 text-gray-800";
}

export function severityIcon(severity: string): string {
  return {
    info: "💡",
    warning: "⚠️",
    positive: "✅",
    critical: "🚨",
  }[severity] ?? "📌";
}
