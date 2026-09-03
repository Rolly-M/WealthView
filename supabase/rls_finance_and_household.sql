-- Run this in the Supabase SQL Editor.
--
-- This is NOT a "add RLS from scratch" script — introspection of the live DB
-- (see conversation history / PR description) showed almost every table
-- already has RLS enabled with working policies from an uncommitted
-- schema.sql: accounts_all, budgets_all, budget_cats_all, goals_all,
-- transactions_all, households_select/insert, members_select/delete,
-- profiles_select/update all already do what this migration would have
-- created. This script only touches what introspection showed to be
-- genuinely broken or missing:
--
-- 1. household_members "members_insert" is a live, currently-exploitable
--    household-takeover IDOR: its WITH CHECK is
--      (is_household_member(household_id) OR user_id = auth.uid())
--    — the OR clause is trivially satisfiable by any authenticated user for
--    any household_id (just insert a row with your own user_id, which the
--    app already always does), so it doesn't actually restrict anything.
--    Replaced with: owner of a brand-new (zero-member) household, or
--    accepting a pending invitation addressed to your own account email.
--
-- 2. invitations has RLS enabled but zero policies (default-deny), so
--    sending/accepting invites and listing pending invites are currently
--    all silently broken. Adds the 4 policies needed for those flows, plus
--    get_invitation_by_token() — a SECURITY DEFINER function so the
--    unauthenticated invite-preview page can look up one invite by exact
--    token without needing an anon SELECT policy (which would otherwise
--    leak every household's pending invites to anyone with the public
--    anon key).
--
-- 3. households has no DELETE policy, silently breaking DELETE /api/profile's
--    "sole member deletes the household" step. Added, owner-gated to match
--    households_update's intent (see #4) — moot in practice since the sole
--    member of a household is always its owner.
--
-- 4. households_update's existing USING clause has a bug:
--      household_members.household_id = household_members.id
--    compares two columns of the same table to each other and never
--    correlates back to the households row being updated, so it's
--    effectively always false — household settings updates are currently
--    broken for everyone, owner or not. Fixed to correlate against
--    households.id, keeping the apparent original intent (owner-only).
--
-- 5. profiles_select is narrower than the app needs — id = auth.uid() only,
--    no household-mate visibility — which is why Settings likely shows
--    "Unknown" for your partner's name today (GET /api/households joins
--    profiles for every member, not just yourself). Added as an *additional*
--    permissive SELECT policy rather than replacing the existing one —
--    Postgres OR-combines multiple permissive policies for the same
--    command, so this only widens access, it can't narrow what already works.
--
-- Idempotent: every CREATE POLICY is preceded by DROP POLICY IF EXISTS.

-- ── 1. Fix the household_members insert IDOR ────────────────────────────
drop policy if exists "members_insert" on public.household_members;
create policy "members_insert" on public.household_members
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

-- ── 2. invitations — currently locked (RLS on, zero policies) ──────────
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
-- while authenticated but NOT yet a household member, so the members-only
-- policy above won't match — allow reading an invite addressed to the
-- caller's own account email regardless of household membership.
drop policy if exists "invitations_select_own_email" on public.invitations;
create policy "invitations_select_own_email" on public.invitations
  for select using (
    auth.uid() is not null
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- GET /api/households/invite/[token] is the unauthenticated invite-preview
-- page — no session, so no RLS policy can key off identity. Exposes only an
-- exact-token lookup, not a general SELECT grant.
create or replace function public.get_invitation_by_token(p_token text)
returns table (
  id uuid,
  household_id uuid,
  email text,
  role text,
  status text,
  expires_at timestamptz,
  household_name text
)
language sql
security definer
set search_path = public
stable
as $$
  select i.id, i.household_id, i.email, i.role::text, i.status::text, i.expires_at, h.name
  from public.invitations i
  join public.households h on h.id = i.household_id
  where i.token = p_token;
$$;

grant execute on function public.get_invitation_by_token(text) to anon, authenticated;

-- ── 3. households — add the missing DELETE policy ───────────────────────
drop policy if exists "households_delete" on public.households;
create policy "households_delete" on public.households
  for delete using (
    exists (
      select 1 from public.household_members
      where household_members.household_id = households.id
        and household_members.user_id = auth.uid()
        and household_members.role = 'owner'::member_role
    )
  );

-- ── 4. households_update — fix the self-referential typo ────────────────
drop policy if exists "households_update" on public.households;
create policy "households_update" on public.households
  for update using (
    exists (
      select 1 from public.household_members
      where household_members.household_id = households.id
        and household_members.user_id = auth.uid()
        and household_members.role = 'owner'::member_role
    )
  );

-- ── 5. profiles — widen SELECT to household-mates (additive) ────────────
drop policy if exists "profiles_select_self_or_household" on public.profiles;
create policy "profiles_select_self_or_household" on public.profiles
  for select using (
    exists (
      select 1
      from public.household_members me
      join public.household_members them on them.household_id = me.household_id
      where me.user_id = auth.uid() and them.user_id = profiles.id
    )
  );
