-- Run this once after deploying the mapCategory fix (frontend/src/lib/plaid.ts),
-- then click "Sync now" in Settings → Accounts (or wait for the next
-- automatic sync).
--
-- Categories were derived from personal_finance_category.primary, which is
-- too coarse to tell fast food from groceries from a sit-down restaurant —
-- they all share the same primary value. Fixed to use .detailed instead.
-- But only our own derived category string was ever stored, not Plaid's
-- raw category — so there's no way to recompute historical categories
-- from what's already in the database.
--
-- Clearing each account's sync cursor makes the next sync walk the full
-- transaction history again instead of only new activity. The existing
-- upsert on provider_transaction_id updates category (and everything
-- else) on matching rows in place — it won't create duplicates.

update public.accounts
set plaid_cursor = null
where provider = 'plaid' and is_active = true;
