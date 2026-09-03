-- Run this in the Supabase SQL Editor before deploying the exchange-token
-- route change that restores `.upsert(..., { onConflict: "provider_account_id" })`.
--
-- Commit 1f4ab36 replaced the atomic upsert with a manual select-then-insert/update
-- specifically because this constraint didn't exist, which reintroduced a TOCTOU
-- race: concurrent Plaid Link flows (double-click, retry, exchange racing a
-- concurrent /plaid/sync) can both see "no existing row" and both insert,
-- producing duplicate account rows for the same provider_account_id.
--
-- If this fails with a uniqueness violation, duplicate provider_account_id rows
-- already exist in `accounts` — find and merge/delete them first, e.g.:
--   select provider_account_id, count(*) from public.accounts
--   group by provider_account_id having count(*) > 1;

alter table public.accounts
  add constraint accounts_provider_account_id_key unique (provider_account_id);
