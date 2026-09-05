-- Run this in the Supabase SQL Editor.
--
-- Backs the Budgets → Tracking Sheet feature: a manually-filled monthly
-- ledger of recurring expenses (rent, subscriptions, insurance, loan
-- payments, etc.) — distinct from the existing Plaid-derived budgets,
-- which auto-compute spend from linked transactions. The point here is
-- the couple typing in what they expect AND what actually happened each
-- month, line by line, to see exactly where every dollar goes. A new
-- sheet is created per month; old ones are never overwritten.

create table if not exists public.tracking_sheets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  month int not null check (month between 1 and 12),
  year int not null,
  name text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, month, year)
);

create table if not exists public.tracking_sheet_items (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references public.tracking_sheets(id) on delete cascade,
  category text not null default 'miscellaneous',
  description text not null default '',
  budgeted_amount numeric(14, 2) not null default 0,
  actual_amount numeric(14, 2) not null default 0,
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tracking_sheets enable row level security;
alter table public.tracking_sheet_items enable row level security;

-- Same is_household_member() gate already used by budgets/goals/chat —
-- any member can view and edit, matching how the rest of the household's
-- shared financial data works.
drop policy if exists "tracking_sheets_all" on public.tracking_sheets;
create policy "tracking_sheets_all" on public.tracking_sheets
  for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists "tracking_sheet_items_all" on public.tracking_sheet_items;
create policy "tracking_sheet_items_all" on public.tracking_sheet_items
  for all
  using (
    exists (
      select 1 from public.tracking_sheets s
      where s.id = tracking_sheet_items.sheet_id
        and public.is_household_member(s.household_id)
    )
  )
  with check (
    exists (
      select 1 from public.tracking_sheets s
      where s.id = tracking_sheet_items.sheet_id
        and public.is_household_member(s.household_id)
    )
  );

create index if not exists tracking_sheet_items_sheet_id_idx on public.tracking_sheet_items(sheet_id);
