-- Run this in the Supabase SQL Editor.
--
-- Backs a fully custom "forgot password" flow via Resend, replacing
-- Supabase's own resetPasswordForEmail — same reasoning as the existing
-- custom email-verification flow (see email_verification.sql): Supabase's
-- default mailer is unbranded, rate-limited, and unreliable, and we
-- already have Resend properly configured with a verified sending domain.
--
-- get_user_id_by_email() is needed because auth.users lives in a schema
-- the public API/PostgREST can't query directly and supabase-js's admin
-- client has no "look up by email" method — this is a SECURITY DEFINER
-- function so it can read auth.users, restricted to the service_role so
-- only trusted server code (never a user-scoped client) can call it. It
-- returns only a bare user id, nothing else, and the API route built on
-- top of it always responds identically whether or not the email matched
-- so this can't be used to enumerate accounts.

create table if not exists public.password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Only ever touched via the service-role admin client — a password reset
-- has to work for a visitor with no session at all. RLS enabled with no
-- policies means a normal user-scoped client gets a hard deny.
alter table public.password_resets enable row level security;

create or replace function public.get_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

revoke execute on function public.get_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.get_user_id_by_email(text) to service_role;
