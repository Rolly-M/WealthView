-- Run this in the Supabase SQL Editor.
--
-- Backs real ETF performance rankings (Investments → Top Picks), replacing
-- the fully mocked 5-ETF dataset that previously had no real market data,
-- no ranking logic, and a frozen as_of_date. Populated by a daily cron
-- (/api/cron/refresh-etf-data) calling Financial Modeling Prep for a
-- curated list of ETF tickers — not household data, so read access is
-- public within the app; writes are service_role only (the cron), no
-- insert/update policy exists for a normal authenticated client.

create table if not exists public.etf_market_data (
  symbol text primary key,
  name text,
  price numeric(12, 2),
  change_1w_pct numeric(8, 3),
  change_1m_pct numeric(8, 3),
  updated_at timestamptz not null default now()
);

alter table public.etf_market_data enable row level security;

drop policy if exists "etf_market_data_read" on public.etf_market_data;
create policy "etf_market_data_read" on public.etf_market_data
  for select using (true);

-- Per-household ETF watchlist — was already called from the Investments
-- page (add/remove/list) but the routes backing it never existed.
create table if not exists public.etf_watchlist (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  symbol text not null,
  added_at timestamptz not null default now(),
  unique (household_id, symbol)
);

alter table public.etf_watchlist enable row level security;

drop policy if exists "etf_watchlist_all" on public.etf_watchlist;
create policy "etf_watchlist_all" on public.etf_watchlist
  for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
