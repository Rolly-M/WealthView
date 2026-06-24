# WealthView Duo — Architecture

## Design Principles

1. **Provider abstraction over vendor lock-in**: The bank integration layer (`BankProvider`) is an abstract interface. Plaid is the default production provider, but swapping it requires only a new class implementing `BankProvider`.

2. **Demo-first**: The app is fully functional with the `MockProvider` and seeded demo data. No external credentials needed for local development.

3. **Privacy by design**: Couples don't share a password. Each user has their own account. Account visibility is per-account (shared/private). The `is_shared` flag controls what partners can see.

4. **Rule-based classification as the primary engine**: The `CategorizationService` uses a keyword-match hierarchy rather than a black-box ML model. This keeps classification explainable and correctable. Users can create custom rules. ML assistance is additive.

5. **Pluggable chat**: The `ChatService` has two modes:
   - Deterministic: direct SQL queries over financial data (no API key needed)
   - LLM: uses OpenAI with the financial data as context (requires `OPENAI_API_KEY`)

## Data Flow

```
Bank (Plaid/Mock)
    ↓ fetch_transactions()
SyncWorker (background)
    ↓ normalize + classify
PostgreSQL (transactions table)
    ↓
InsightEngine (scheduled after sync)
    ↓
Insight table
    ↓
Frontend polls / displays
```

## Categorization Hierarchy

```
1. User rules (TransactionRule table) — confidence: 1.0
2. Keyword merchant rules (categorization.py) — confidence: 0.85-0.97
3. Negative large amount → income heuristic — confidence: 0.75
4. Provider-supplied category mapping — confidence: 0.70
5. Default: miscellaneous — confidence: 0.40
```

Every categorization records `category_source` and `category_explanation` so users can understand why a transaction was classified.

## Household & Permission Model

```
Household (1)
  ├── HouseholdMember (n) → role: owner | editor | viewer
  ├── Account (n) → is_shared: bool (per account)
  │     └── Transaction (n)
  ├── Budget (n) → scope: household | personal
  ├── Goal (n) → scope: household | personal
  └── ChatThread (n) → scope: household | personal
```

See [COUPLES_SHARING.md](COUPLES_SHARING.md) for the full privacy spec.

## Sync Architecture

The background worker (`SyncWorker`) runs a loop:
1. Fetch all active accounts
2. For each account, call the provider's `fetch_transactions()`
3. Normalize + classify each transaction
4. Upsert by `provider_transaction_id` (idempotent)
5. Generate insights for each household

This loop runs hourly in production. In demo mode, mock data is seeded once at startup.

## Database Schema Overview

See models/ for full schema. Key relationships:

- `users` → `household_members` (many-to-many via HouseholdMember)
- `accounts` → `transactions` (one-to-many)
- `budgets` → `budget_categories` (one-to-many)
- `goals` → `goal_contributions` (one-to-many)
- `etf_securities` → `etf_metrics_snapshots` (one-to-many, latest is used)
- `watchlists` → `watchlist_items` → `etf_securities`

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| AsyncPG + SQLAlchemy 2.0 async | Full async I/O for high throughput |
| Alembic for migrations | Production-safe schema evolution |
| Pydantic v2 settings | Type-safe config with env var parsing |
| Next.js App Router | React Server Components + streaming |
| Recharts | Flexible, composable charts in React |
| Zustand | Lightweight state without Redux complexity |
| JWT (not sessions) | Stateless, works across services |
| Refresh token rotation | Long-lived sessions without insecure cookies |
