-- Run this in the Supabase SQL Editor.
--
-- Invites are being redesigned to be pure shareable links — generate one,
-- send it however you like, first person who opens it and signs up joins
-- the household — instead of requiring the household owner to know and
-- type their partner's exact email address up front.
--
-- Makes invitations.email nullable, and widens members_insert to allow
-- accepting an invite with no target email (open invite) in addition to
-- the existing "email matches" case, for any code path that still inserts
-- household_members under the caller's own session rather than the admin
-- client. Existing invites that do have an email keep working exactly as
-- before — this only adds the null case, nothing is narrowed.

alter table public.invitations alter column email drop not null;

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
          and (
            i.email is null
            or lower(i.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          )
      )
    )
  );
