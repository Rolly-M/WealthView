# Investment Research Section

## Disclaimer

**WealthView Duo's investment section is a research and screening tool. It does not provide personalized investment advice. All data is for educational purposes. Past performance does not guarantee future results. Consult a licensed financial advisor before making investment decisions.**

---

## Purpose

The investment section helps couples:
1. Discover income-oriented ETFs that may fit their financial goals
2. Compare ETFs across key metrics
3. Build a watchlist of candidates for further research
4. Understand what each metric means

It does NOT:
- Recommend allocations
- Execute trades
- Assess individual suitability
- Predict returns

---

## Featured ETFs (Demo Data)

| Ticker | Name | Yield | Expense | 1Y Return | Country |
|--------|------|-------|---------|-----------|---------|
| SCHD | Schwab US Dividend Equity | 3.42% | 0.06% | +14.8% | US |
| VIG | Vanguard Dividend Appreciation | 1.78% | 0.06% | +18.2% | US |
| DVY | iShares Select Dividend | 4.90% | 0.38% | +9.2% | US |
| VDY | Vanguard FTSE Canadian High Div | 4.58% | 0.22% | +11.2% | CA |
| XDIV.TO | iShares Core MSCI Canadian Quality Div | 4.28% | 0.11% | +12.2% | CA |

### Research Rationale

**SCHD** — Gold standard for dividend growth. 0.06% expense ratio, rigorous quality screens (4 fundamental criteria including cash flow to debt ratio, ROE, yield relative to index, dividend growth rate), 10+ year dividend growth streak averaging 11%/year.

**VIG** — Requires 10+ consecutive years of dividend increases. Acts as a quality filter. Lower current yield but higher total return potential. Core long-term holding.

**DVY** — Highest current yield of the US ETFs. Heavily utilities/energy weighted. Good for current income. Interest-rate sensitive — pairs well with growth-tilted ETFs.

**VDY** — Leading Canadian high-dividend ETF. Dominated by Canadian banks and pipelines. Monthly distributions. Tax-advantaged in TFSA/RRSP for Canadian investors.

**XDIV.TO** — Applies quality screens (ROE, debt-to-equity) to Canadian high-yield stocks. Monthly distributions. Lower expense ratio than actively managed Canadian dividend funds.

---

## Screener Filters

| Filter | Description |
|--------|-------------|
| Min yield (%) | Minimum trailing 12-month dividend yield |
| Max expense ratio (%) | Maximum annual expense ratio |
| Min 1Y return (%) | Minimum 1-year price return |
| Category | "High Dividend" or "Dividend Growth" |
| Search | Ticker symbol or ETF name |
| Region | US or Canada |

---

## Metric Definitions

| Metric | Definition | Educational Note |
|--------|-----------|-----------------|
| Dividend Yield (TTM) | Annual dividends per share / share price (last 12 months) | Higher isn't always better — check the growth trend |
| Expense Ratio | Annual management fee as % of assets | Compounding makes even 0.1% difference significant over 20 years |
| 1Y Return | Total return including dividends over past year | One year is not sufficient to evaluate any ETF |
| 3Y/5Y Annualized | Compound annual return over 3 or 5 years | Better signal than 1Y for evaluating quality |
| Dividend Growth 1Y/3Y/5Y | Year-over-year growth in dividend payments | Dividend growth = inflation protection + compounding |
| Volatility (1Y) | Annualized standard deviation of daily returns | Higher = more price swings |
| Sharpe Ratio | Return per unit of risk (vs. risk-free rate) | >1.0 generally considered good; higher is better |
| Beta | Price sensitivity vs. broader market | <1.0 = less volatile than market |
| P/E Ratio | Price / earnings of underlying holdings | Lower can mean value, but context matters |
| AUM | Total assets under management | Higher AUM = more liquid, lower spread risk |
| Holdings Count | Number of underlying positions | Diversification proxy |

---

## Watchlist

Users can bookmark ETFs to their personal watchlist. Watchlists are:
- Per-user (not shared with partners unless explicitly)
- Persistent across sessions
- Available via `GET /api/v1/etf/watchlist/mine`

---

## Data Freshness

In demo mode, all ETF data is pre-seeded with static values as of the demo date.

In production, connect a live data provider (e.g., Yahoo Finance API, Alpha Vantage, Quandl, or a financial data aggregator) and update `ETFMetricsSnapshot` records on a daily schedule. The provider abstraction in `ETFService` supports swapping the data source.

Always display the `as_of_date` prominently to users so they know how fresh the data is.
