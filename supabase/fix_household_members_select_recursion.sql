-- Run this in the Supabase SQL Editor FIRST, before the cleanup script
-- (dedupe_orphan_households.sql) in this same directory.
--
-- Confirmed live: a user-scoped SELECT for a user's own household_members
-- row comes back empty EVERY time, even immediately after an admin-client
-- insert of that exact row. Calling GET /api/households four times in a
-- row for the same logged-in user returned four different household ids —
-- getOrCreateMembership() sees "no membership found" on every single call
-- (because the SELECT it runs always comes back empty) and silently
-- creates a brand-new orphan household + owner row each time.
--
-- This is almost certainly why: "members_select" is self-referential —
-- something shaped like
--   USING (household_id IN (SELECT household_id FROM household_members
--                            WHERE user_id = auth.uid()))
-- To decide whether a row is visible, Postgres has to evaluate that inner
-- SELECT against household_members — which re-triggers the same SELECT
-- policy on itself. The row can never prove it should be visible because
-- proving it requires it to already be visible. Zero rows, always.
--
-- This one bug is the root cause of essentially every "No household" /
-- vanishing-data issue hit this session: invites, bank account linking —
-- anything going through getOrCreateMembership was spawning a fresh
-- disposable household on every request.
--
-- Fix: move the membership check into a SECURITY DEFINER function, which
-- runs as its owner and so bypasses RLS for its own internal query —
-- breaking the self-reference. Same escape-hatch pattern this codebase
-- already uses for get_invitation_by_token() in
-- rls_finance_and_household.sql.

create or replace function public.is_own_household(p_household_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.household_members
    where household_id = p_household_id and user_id = auth.uid()
  );
$$;

grant execute on function public.is_own_household(uuid) to authenticated;

drop policy if exists "members_select" on public.household_members;
create policy "members_select" on public.household_members
  for select using (public.is_own_household(household_id));

-- If members_delete/members_update have the same self-referential shape,
-- uncomment and adjust — not changed here since only members_select was
-- confirmed broken by testing.
-- drop policy if exists "members_delete" on public.household_members;
-- create policy "members_delete" on public.household_members
--   for delete using (public.is_own_household(household_id));
