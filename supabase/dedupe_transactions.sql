-- Run this in the Supabase SQL Editor any time after deploying the
-- syncPlaidTransactions fix (frontend/src/lib/plaid.ts).
--
-- Confirmed live: /api/plaid/exchange-token's transaction sync never
-- processed transactionsSync's `removed` array. Plaid replaces a pending
-- transaction with a new id once it posts, reporting the old id there —
-- skipping it left both the pending and posted copies of the same real
-- transaction in the table, each with a different provider_transaction_id
-- (so the existing unique constraint didn't catch it either). One test
-- account showed dozens of these across ~90 duplicate groups.
--
-- Dedupes by (account_id, date, amount, description): within each group,
-- keeps the row that's posted over pending, tie-broken by most recently
-- updated, and deletes the rest.
--
-- Idempotent and safe to re-run. Review the SELECT below before running
-- the cleanup block.

-- ── Inspect scope first ──────────────────────────────────────────────────
select account_id, date, amount, description, count(*) as dup_count
from public.transactions
group by account_id, date, amount, description
having count(*) > 1
order by dup_count desc;

-- ── Consolidate ──────────────────────────────────────────────────────────
do $$
declare
  grp record;
  keeper_id uuid;
begin
  for grp in
    select account_id, date, amount, description
    from public.transactions
    group by account_id, date, amount, description
    having count(*) > 1
  loop
    select id into keeper_id
    from public.transactions
    where account_id = grp.account_id and date = grp.date
      and amount = grp.amount
      and (description = grp.description or (description is null and grp.description is null))
    order by is_pending asc, updated_at desc
    limit 1;

    delete from public.transactions
    where account_id = grp.account_id and date = grp.date
      and amount = grp.amount
      and (description = grp.description or (description is null and grp.description is null))
      and id <> keeper_id;
  end loop;
end $$;

-- ── Verify ───────────────────────────────────────────────────────────────
select account_id, date, amount, description, count(*) as dup_count
from public.transactions
group by account_id, date, amount, description
having count(*) > 1;
-- Should return zero rows.
