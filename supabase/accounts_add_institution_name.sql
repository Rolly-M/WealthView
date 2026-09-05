-- Run this in the Supabase SQL Editor before redeploying the change that
-- populates this column.
--
-- Needed to group linked accounts by bank in the UI — accounts had no
-- institution field at all (the "name"/"official_name" columns are the
-- account product name, e.g. "Desjardins Cash Back Visa", not the
-- institution itself). Plaid Link's onSuccess metadata already includes
-- the institution name for free (no extra API call needed).

alter table public.accounts
  add column if not exists institution_name text;
