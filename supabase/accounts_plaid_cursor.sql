-- Run this in the Supabase SQL Editor.
--
-- Neither /api/plaid/exchange-token nor /api/plaid/sync persisted Plaid's
-- transactionsSync cursor, so every single sync call — the initial import
-- included — re-walked the linked account's ENTIRE transaction history from
-- scratch via a synchronous while(hasMore) loop before responding. For any
-- account with more than a trivial amount of history this exceeds Vercel's
-- function timeout, which is what made bank import (and every subsequent
-- "Sync now") hang on "Importing…"/"Syncing…" with no error ever surfacing.
--
-- Adding a cursor column lets both routes resume from where they left off,
-- so only new/changed transactions are fetched after the first sync.

alter table public.accounts
  add column if not exists plaid_cursor text;
