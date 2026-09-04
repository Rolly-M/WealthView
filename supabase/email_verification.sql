-- Run this in the Supabase SQL Editor.
--
-- Backs a fully custom "verify your email" flow (frontend/src/app/api/auth/
-- send-verification and /verify-email/[token]), used instead of Supabase's
-- built-in confirmation email since template/SMTP customization needs a
-- paid plan. Also turn off Supabase's own confirmation requirement in
-- Dashboard → Authentication → Providers → Email → "Confirm email" (a free
-- toggle) so users don't get both Supabase's default-branded email and ours.

create table if not exists public.email_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists email_verified boolean not null default false;

-- Only ever touched via the service-role admin client (verification has to
-- work for a visitor with no session — they clicked a link from an email,
-- possibly on a different device). RLS enabled with no policies means a
-- normal user-scoped client gets a hard deny, which is what we want here.
alter table public.email_verifications enable row level security;
