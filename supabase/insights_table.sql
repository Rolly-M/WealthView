-- Run this in the Supabase SQL Editor.
--
-- /api/insights previously recomputed insights from scratch on every GET
-- and never persisted anything — is_read/is_dismissed/is_saved were always
-- hardcoded false, and the UI's "mark read"/"dismiss"/"save" actions (and
-- a "Generate" button) called routes that didn't exist
-- (/api/insights/[id]/action, /api/insights/generate) and 404'd.
--
-- dedup_key + the unique constraint below is what makes "generate several
-- times a day without duplicates" work: generation always upserts on
-- conflict do nothing, so re-running it (page load, manual refresh, daily
-- cron) only ever inserts an insight the household doesn't already have
-- for that period — e.g. "groceries spending spike" is keyed per
-- household+category+month, so it's computed and stored at most once a
-- month no matter how many times generation runs.

create table if not exists public.insights (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  severity text not null default 'info',
  category text,
  amount numeric(14, 2),
  pct_change numeric(8, 2),
  is_read boolean not null default false,
  is_dismissed boolean not null default false,
  is_saved boolean not null default false,
  metadata_ jsonb not null default '{}',
  dedup_key text not null,
  created_at timestamptz not null default now(),
  unique (household_id, dedup_key)
);

alter table public.insights enable row level security;

drop policy if exists "insights_all" on public.insights;
create policy "insights_all" on public.insights
  for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create index if not exists insights_household_id_idx on public.insights(household_id, created_at desc);
