// Financial Modeling Prep client — the real market data source behind
// Investments → Top Picks (top 5 this week / top 10 this month), replacing
// what was previously 5 hardcoded ETFs with a frozen as_of_date and no
// actual ranking logic.
//
// A curated list rather than FMP's full ETF universe (thousands of
// tickers) — ranking needs two API calls per symbol per refresh (quote +
// price-change), so this keeps a daily cron well within a free-tier rate
// limit while still covering a genuinely diverse set: broad market,
// sector, bond, international, dividend, and thematic funds.
export const TRACKED_ETF_SYMBOLS = [
  "VTI", "VOO", "SPY", "QQQ", "QQQM", "VUG", "VTV", "IWM",
  "VEA", "VWO", "VXUS", "EFA", "EEM",
  "BND", "AGG", "TLT", "LQD",
  "SCHD", "VYM", "DVY",
  "XLK", "XLF", "XLE", "XLV", "XLY", "XLP", "XLI", "XLU", "XLB", "XLRE",
  "ARKK", "SOXX", "SMH",
  "GLD", "SLV", "USO",
  "IJH", "IJR", "MDY", "VNQ",
];

const FMP_BASE = "https://financialmodelingprep.com/api/v3";

export interface FmpSymbolData {
  symbol: string;
  name: string | null;
  price: number | null;
  change1w: number | null;
  change1m: number | null;
}

export async function fetchFmpSymbolData(symbol: string): Promise<FmpSymbolData | null> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) return null;

  try {
    const [quoteRes, changeRes] = await Promise.all([
      fetch(`${FMP_BASE}/quote/${symbol}?apikey=${apiKey}`),
      fetch(`${FMP_BASE}/stock-price-change/${symbol}?apikey=${apiKey}`),
    ]);
    if (!quoteRes.ok || !changeRes.ok) return null;

    const quoteData = await quoteRes.json();
    const changeData = await changeRes.json();
    const quote = Array.isArray(quoteData) ? quoteData[0] : quoteData;
    const change = Array.isArray(changeData) ? changeData[0] : changeData;
    if (!quote) return null;

    return {
      symbol,
      name: quote.name ?? null,
      price: quote.price ?? null,
      change1w: change?.["5D"] ?? null,
      change1m: change?.["1M"] ?? null,
    };
  } catch (err) {
    console.error(`FMP fetch failed for ${symbol}:`, err);
    return null;
  }
}
