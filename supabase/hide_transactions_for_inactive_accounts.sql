-- Run this in the Supabase SQL Editor after deploying the accounts/[id]
-- DELETE route change (frontend/src/app/api/accounts/[id]/route.ts).
--
-- Root cause of "still seeing a lot of duplicates in transactions":
-- disconnecting a bank account only ever set accounts.is_active = false —
-- it never touched that account's transactions. Every transaction-reading
-- endpoint (list, summary, budgets, insights, chat context) filters on
-- is_hidden, not on the owning account's is_active, so a disconnected
-- duplicate account's full transaction history kept showing up right next
-- to whichever account it was a duplicate of. Confirmed live: a
-- disconnected "Chequing Account" duplicate (id d1c3b5ae...) had been
-- removed from the accounts list entirely, but its ~90 transactions —
-- "Mobile bill payment", "INTERAC e-Transfer", etc. — were still fully
-- visible, identical in every field except id to the kept account's copies.
--
-- This retroactively hides transactions for any account that's already
-- been disconnected. Idempotent and safe to re-run.

update public.transactions
set is_hidden = true
where is_hidden = false
  and account_id in (select id from public.accounts where is_active = false);
