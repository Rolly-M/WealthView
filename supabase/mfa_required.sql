-- Run this in the Supabase SQL Editor.
--
-- Backs mandatory MFA enrollment at account creation (password registration
-- and invite-accept signup only — Google OAuth accounts are exempt, since
-- Google already provides its own strong auth). Defaults to false, so
-- existing accounts are unaffected — only accounts created after this ships
-- (via POST /api/auth/require-mfa, called right after signup) get flagged.

alter table public.profiles
  add column if not exists mfa_required boolean not null default false;
