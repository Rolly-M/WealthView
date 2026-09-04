-- Run this in the Supabase SQL Editor.
--
-- exchange-token's accountPayload sets official_name, provider_access_token,
-- and credit_limit, but the live `accounts` table has none of them (confirmed
-- via information_schema.columns — it only has id, household_id, owner_id,
-- name, type, subtype, currency, current_balance, available_balance,
-- is_shared, is_active, include_in_net_worth, provider, provider_account_id,
-- last_synced_at, created_at, updated_at). provider_access_token is the
-- critical one: without it, there's nowhere to store the Plaid access token
-- needed to ever sync this account again.
--
-- Every upsert into accounts including these fields has been silently
-- failing at the DB level (PostgREST "column not found" error) since the
-- upsert's error was never checked (fixed alongside this migration), so
-- linking a bank account has never actually persisted an account row.

alter table public.accounts
  add column if not exists official_name text,
  add column if not exists provider_access_token text,
  add column if not exists credit_limit numeric(14, 2);
