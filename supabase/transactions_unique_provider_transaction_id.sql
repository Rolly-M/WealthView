-- Run this in the Supabase SQL Editor.
--
-- Both plaid/exchange-token and plaid/sync do
--   .upsert(toInsert, { onConflict: "provider_transaction_id" })
-- against `transactions` — but the live `transactions` table has no
-- provider_transaction_id column at all (confirmed via information_schema.columns:
-- it has id, account_id, household_id, amount, currency, date, merchant_name,
-- description, category, is_pending, is_recurring, is_income, is_hidden, notes,
-- tags, created_at, updated_at — nothing to store Plaid's dedup key in). So this
-- was never just a missing-constraint issue like accounts was; the column itself
-- needs to be added first. Nullable, since manually-added transactions
-- (POST /api/transactions) never set it, and Postgres allows any number of NULLs
-- under a UNIQUE constraint.
--
-- If the constraint step fails with a uniqueness violation, duplicate
-- provider_transaction_id rows already exist — find them first:
--   select provider_transaction_id, count(*) from public.transactions
--   group by provider_transaction_id having count(*) > 1;

alter table public.transactions
  add column if not exists provider_transaction_id text;

alter table public.transactions
  add constraint transactions_provider_transaction_id_key unique (provider_transaction_id);
