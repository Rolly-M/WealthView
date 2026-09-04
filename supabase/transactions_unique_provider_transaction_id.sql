-- Run this in the Supabase SQL Editor.
--
-- Both plaid/exchange-token and plaid/sync do
--   .upsert(toInsert, { onConflict: "provider_transaction_id" })
-- against `transactions`, exactly like the accounts upsert did — but unlike
-- accounts, transactions never got the matching unique constraint. Without
-- it, onConflict has nothing to match against and the upsert silently fails
-- at the DB level; the route code didn't check the upsert's error either
-- (fixed alongside this migration), so linking a bank account would report
-- success with zero transactions imported.
--
-- If this fails with a uniqueness violation, duplicate provider_transaction_id
-- rows already exist — find them first:
--   select provider_transaction_id, count(*) from public.transactions
--   group by provider_transaction_id having count(*) > 1;

alter table public.transactions
  add constraint transactions_provider_transaction_id_key unique (provider_transaction_id);
