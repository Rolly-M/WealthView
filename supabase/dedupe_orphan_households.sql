-- Run this in the Supabase SQL Editor SECOND, after
-- fix_household_members_select_recursion.sql.
--
-- The self-referential RLS bug fixed by that script meant
-- getOrCreateMembership() spawned a brand-new orphan household + owner
-- membership row on essentially every API request for every user, for as
-- long as that bug has been live. Confirmed on one account: four
-- consecutive GET /api/households calls returned four different household
-- ids, and a bank account linked via Plaid (3 real accounts, successfully
-- inserted) ended up invisible because the very next request had already
-- spun up yet another empty household.
--
-- Fixing the RLS policy alone is NOT enough: this user now has many
-- household_members rows (one per orphan household). Once SELECT actually
-- works, the existing .single() call in getOrCreateMembership will find
-- MULTIPLE rows and error out (PostgREST rejects .single() with >1 row),
-- which getOrCreateMembership currently treats the same as "not found" —
-- so it would keep creating new households forever even after the RLS fix,
-- unless each user is first collapsed down to exactly one household.
--
-- What this does, per user:
--   1. Picks one "canonical" household — preferring (in order) the
--      household with the most members (a real shared household beats a
--      solo accident), then the one with the most linked accounts (so a
--      real bank-linked household isn't discarded in favor of an empty
--      one), then the earliest-joined as a final tiebreak.
--   2. For every OTHER household where this user is the ONLY member (a
--      safe-to-absorb solo orphan — never touches a shared household),
--      moves its accounts/transactions/budgets/goals/chat_threads/
--      invitations onto the canonical household, removes the user's
--      membership row, and deletes the now-empty household.
--
-- Idempotent and safe to re-run. Review the SELECT below before running
-- the UPDATE/DELETE block — it shows how many duplicate households exist
-- per user so you know the scope before changing anything.

-- ── Inspect scope first ──────────────────────────────────────────────────
select user_id, count(*) as household_count
from public.household_members
group by user_id
having count(*) > 1
order by household_count desc;

-- ── Consolidate ──────────────────────────────────────────────────────────
do $$
declare
  u record;
  canonical_household uuid;
  h record;
begin
  for u in select distinct user_id from public.household_members loop

    select hm.household_id into canonical_household
    from public.household_members hm
    where hm.user_id = u.user_id
    order by
      (select count(*) from public.household_members hm2
         where hm2.household_id = hm.household_id) desc,
      (select count(*) from public.accounts a
         where a.household_id = hm.household_id) desc,
      hm.joined_at asc
    limit 1;

    for h in
      select hm.household_id
      from public.household_members hm
      where hm.user_id = u.user_id
        and hm.household_id <> canonical_household
        and (select count(*) from public.household_members hm2
               where hm2.household_id = hm.household_id) = 1
    loop
      update public.accounts set household_id = canonical_household where household_id = h.household_id;
      update public.transactions set household_id = canonical_household where household_id = h.household_id;
      update public.budgets set household_id = canonical_household where household_id = h.household_id;
      update public.goals set household_id = canonical_household where household_id = h.household_id;
      update public.chat_threads set household_id = canonical_household where household_id = h.household_id;
      update public.invitations set household_id = canonical_household where household_id = h.household_id;

      delete from public.household_members
        where household_id = h.household_id and user_id = u.user_id;

      delete from public.households
        where id = h.household_id
          and not exists (
            select 1 from public.household_members where household_id = h.household_id
          );
    end loop;

  end loop;
end $$;

-- ── Verify ───────────────────────────────────────────────────────────────
select user_id, count(*) as household_count
from public.household_members
group by user_id
having count(*) > 1;
-- Should return zero rows.
