-- Run this in the Supabase SQL Editor after accounts_add_mask.sql.
--
-- Cleans up duplicate Plaid accounts created by re-linking the same
-- institution while debugging the household RLS bug — each full Link
-- re-auth creates a new Plaid Item with new account_ids for the same real
-- accounts, so the unique constraint on provider_account_id didn't catch
-- it. Old rows predate the mask column, so this dedupes on
-- (household_id, provider, name, type, subtype) instead: for each group of
-- more than one row, keeps the most recently synced account and moves any
-- transactions pointing at the older duplicate(s) onto the keeper before
-- deleting them, so transaction history isn't lost.
--
-- Idempotent and safe to re-run. Review the SELECT below before running
-- the cleanup block.

-- ── Inspect scope first ──────────────────────────────────────────────────
select household_id, name, type, subtype, count(*) as dup_count
from public.accounts
where provider = 'plaid' and is_active = true
group by household_id, name, type, subtype
having count(*) > 1
order by dup_count desc;

-- ── Consolidate ──────────────────────────────────────────────────────────
do $$
declare
  grp record;
  keeper_id uuid;
  loser record;
begin
  for grp in
    select household_id, name, type, subtype
    from public.accounts
    where provider = 'plaid' and is_active = true
    group by household_id, name, type, subtype
    having count(*) > 1
  loop
    select id into keeper_id
    from public.accounts
    where household_id = grp.household_id
      and name = grp.name and type = grp.type
      and (subtype = grp.subtype or (subtype is null and grp.subtype is null))
      and provider = 'plaid' and is_active = true
    order by last_synced_at desc nulls last, created_at desc
    limit 1;

    for loser in
      select id
      from public.accounts
      where household_id = grp.household_id
        and name = grp.name and type = grp.type
        and (subtype = grp.subtype or (subtype is null and grp.subtype is null))
        and provider = 'plaid' and is_active = true
        and id <> keeper_id
    loop
      -- Move transactions onto the keeper; skip any that would collide on
      -- provider_transaction_id (Plaid transaction ids are globally unique
      -- per Item, so duplicates here would only happen if the same
      -- transaction was somehow synced under both accounts already).
      update public.transactions t
      set account_id = keeper_id
      where t.account_id = loser.id
        and not exists (
          select 1 from public.transactions t2
          where t2.account_id = keeper_id
            and t2.provider_transaction_id = t.provider_transaction_id
        );

      delete from public.transactions where account_id = loser.id;
      delete from public.accounts where id = loser.id;
    end loop;
  end loop;
end $$;

-- ── Verify ───────────────────────────────────────────────────────────────
select household_id, name, type, subtype, count(*) as dup_count
from public.accounts
where provider = 'plaid' and is_active = true
group by household_id, name, type, subtype
having count(*) > 1;
-- Should return zero rows.
