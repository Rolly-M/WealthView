-- Run this in the Supabase SQL Editor AFTER the main schema.sql (and after chat.sql).
-- Adds RLS to every table the Next.js API routes read/write directly via the
-- user-scoped Supabase client (frontend/src/lib/supabase/server.ts, anon key + user
-- session — NOT the service-role admin client, which already bypasses RLS).
--
-- Tables covered: households, household_members, invitations, profiles,
-- accounts, budgets, budget_categories, goals, transactions.
--
-- Review before running against production — in particular the household_members
-- insert policy and the get_invitation_by_token() function, which replace app-level
-- checks that used to be the only thing standing between a user and another
-- household's data.
--
-- Idempotent: every CREATE POLICY is preceded by DROP POLICY IF EXISTS, so this
-- is safe to re-run in full after a partial failure (the Supabase SQL Editor
-- commits each statement as it runs rather than the whole script atomically).

-- ── Helper: is the current user a member of this household? ────────────────
-- public.is_household_member(uuid) already exists in this database (it's what
-- chat.sql's chat_threads_all / chat_messages_all policies call) — reused
-- as-is rather than redefined, since CREATE OR REPLACE can't rename an
-- existing function's parameter and DROP ... CASCADE would risk taking any
-- policies built on it with it. Every call below passes household_id
-- positionally, so it doesn't matter what the existing function calls its
-- parameter internally.

-- ── households ───────────────────────────────────────────────────────────
alter table public.households enable row level security;

drop policy if exists "households_select" on public.households;
create policy "households_select" on public.households
  for select using (public.is_household_member(id));

-- Any authenticated user may create a household; they only gain access to it
-- once household_members_insert (below) lets them add themselves as owner.
drop policy if exists "households_insert" on public.households;
create policy "households_insert" on public.households
  for insert with check (auth.uid() is not null);

drop policy if exists "households_update" on public.households;
create policy "households_update" on public.households
  for update using (public.is_household_member(id));

-- Matches DELETE /api/profile's "sole member deletes the household" flow.
drop policy if exists "households_delete" on public.households;
create policy "households_delete" on public.households
  for delete using (public.is_household_member(id));

-- ── household_members ───────────────────────────────────────────────────
alter table public.household_members enable row level security;

drop policy if exists "household_members_select" on public.household_members;
create policy "household_members_select" on public.household_members
  for select using (public.is_household_member(household_id));

-- A user may add themselves (never someone else) in exactly two cases:
--   1. Creating a brand-new household (they become its first/owner member), or
--   2. Accepting a pending invitation addressed to their own account email.
-- This is what stands between an attacker and joining an arbitrary existing
-- household now that the row-level check exists at the DB layer too.
drop policy if exists "household_members_insert_self" on public.household_members;
create policy "household_members_insert_self" on public.household_members
  for insert
  with check (
    user_id = auth.uid()
    and (
      (
        role = 'owner'
        and not exists (
          select 1 from public.household_members hm2
          where hm2.household_id = household_members.household_id
        )
      )
      or exists (
        select 1 from public.invitations i
        where i.household_id = household_members.household_id
          and i.status = 'pending'
          and i.expires_at > now()
          and lower(i.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
    )
  );

-- Matches DELETE /api/profile's "remove only this user's membership" flow.
drop policy if exists "household_members_delete_self" on public.household_members;
create policy "household_members_delete_self" on public.household_members
  for delete using (user_id = auth.uid());

-- ── invitations ──────────────────────────────────────────────────────────
alter table public.invitations enable row level security;

-- Household members manage invites for their own household (send, list, revoke).
drop policy if exists "invitations_select_members" on public.invitations;
create policy "invitations_select_members" on public.invitations
  for select using (public.is_household_member(household_id));

drop policy if exists "invitations_insert_members" on public.invitations;
create policy "invitations_insert_members" on public.invitations
  for insert with check (public.is_household_member(household_id));

drop policy if exists "invitations_update_members" on public.invitations;
create policy "invitations_update_members" on public.invitations
  for update using (public.is_household_member(household_id));

-- POST /api/households/invite/[token]'s accept flow reads the invite by token
-- while the caller is authenticated but NOT yet a household member — the
-- members-only policy above won't match, so allow reading an invite addressed
-- to the caller's own account email regardless of household membership.
drop policy if exists "invitations_select_own_email" on public.invitations;
create policy "invitations_select_own_email" on public.invitations
  for select using (
    auth.uid() is not null
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- GET /api/households/invite/[token] is the unauthenticated invite-preview
-- page — the invitee has no session yet, so no RLS policy can key off their
-- identity. Selecting from the table directly would require an anon SELECT
-- policy, which would leak every household's pending invites (email, token,
-- role) to anyone with the public anon key. Instead expose only an
-- exact-token lookup through this SECURITY DEFINER function.
create or replace function public.get_invitation_by_token(p_token text)
returns table (
  id uuid,
  household_id uuid,
  email text,
  role invitation_role,
  status invitation_status,
  expires_at timestamptz,
  household_name text
)
language sql
security definer
set search_path = public
stable
as $$
  select i.id, i.household_id, i.email, i.role, i.status, i.expires_at, h.name
  from public.invitations i
  join public.households h on h.id = i.household_id
  where i.token = p_token;
$$;

grant execute on function public.get_invitation_by_token(text) to anon, authenticated;

-- ── profiles ─────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

-- Your own profile, plus profiles of anyone who shares a household with you
-- (needed for GET /api/households' member list).
drop policy if exists "profiles_select_self_or_household" on public.profiles;
create policy "profiles_select_self_or_household" on public.profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1
      from public.household_members me
      join public.household_members them on them.household_id = me.household_id
      where me.user_id = auth.uid() and them.user_id = profiles.id
    )
  );

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
  for update using (id = auth.uid());

-- ── accounts / budgets / budget_categories / goals / transactions ─────────
-- Straightforward: any household member may read/write rows belonging to
-- their own household. No RLS policy exists for these tables today.
alter table public.accounts enable row level security;
drop policy if exists "accounts_all" on public.accounts;
create policy "accounts_all" on public.accounts
  for all using (public.is_household_member(household_id));

alter table public.budgets enable row level security;
drop policy if exists "budgets_all" on public.budgets;
create policy "budgets_all" on public.budgets
  for all using (public.is_household_member(household_id));

alter table public.budget_categories enable row level security;
drop policy if exists "budget_categories_all" on public.budget_categories;
create policy "budget_categories_all" on public.budget_categories
  for all using (
    exists (
      select 1 from public.budgets b
      where b.id = budget_id and public.is_household_member(b.household_id)
    )
  );

alter table public.goals enable row level security;
drop policy if exists "goals_all" on public.goals;
create policy "goals_all" on public.goals
  for all using (public.is_household_member(household_id));

alter table public.transactions enable row level security;
drop policy if exists "transactions_all" on public.transactions;
create policy "transactions_all" on public.transactions
  for all using (public.is_household_member(household_id));
