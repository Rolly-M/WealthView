import { NextResponse } from "next/server";
import { MOCK_ETFS } from "./_data";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.toLowerCase();
  const category = searchParams.get("category");
  const maxExpenseRatio = searchParams.get("max_expense_ratio");

  let results = [...MOCK_ETFS];

  if (query) {
    results = results.filter(
      (e) => e.ticker.toLowerCase().includes(query) || e.name.toLowerCase().includes(query)
    );
  }
  if (category) {
    results = results.filter((e) => e.category?.toLowerCase() === category.toLowerCase());
  }
  if (maxExpenseRatio) {
    const max = parseFloat(maxExpenseRatio);
    results = results.filter(
      (e) => e.latest_metrics?.expense_ratio != null && e.latest_metrics.expense_ratio <= max
    );
  }

  return NextResponse.json(results);
}
