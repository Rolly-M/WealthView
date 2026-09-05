-- Run this in the Supabase SQL Editor before redeploying the
-- exchange-token change that uses this column.
--
-- Plaid's account_id is only stable within one "Item" (one Link
-- authentication session). Fully re-linking the same institution — as
-- happened twice while debugging the household RLS bug — creates a new
-- Item with entirely new account_ids for the same real bank accounts, so
-- the existing unique constraint on provider_account_id doesn't catch a
-- re-link: it looks like brand-new accounts and gets inserted as
-- duplicates. Storing the account's last-4-digit mask lets exchange-token
-- recognize "this is the same real account under a new Item" and update
-- the existing row instead of inserting a second one.

alter table public.accounts
  add column if not exists mask text;
