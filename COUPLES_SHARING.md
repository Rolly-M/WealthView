# Couples Sharing & Privacy Model

## Core Concept

WealthView Duo is designed for **two separate people who share a financial life**.

- Each person has their own login credentials
- Accounts can be shared or private, controlled per-account
- There is one **Household** that both members belong to
- Budgets and goals can be scoped to the household or kept personal
- The household "dashboard" shows a combined view of shared data

## Permission Roles

| Role | Capabilities |
|------|-------------|
| `owner` | Full control: invite members, remove members, edit household settings, edit all shared data |
| `editor` | Can add/edit transactions, budgets, goals, and linked accounts |
| `viewer` | Read-only access to shared household data |

Default role when accepting an invite: `editor`

## Account Visibility

Each `Account` has an `is_shared` boolean:

- `is_shared = true`: Both household members can see balances and transactions
- `is_shared = false`: Only the account owner can see it

When listing accounts and transactions, the API filters by:
```python
visible = [a for a in accounts if a.is_shared or str(a.owner_id) == str(user.id)]
```

This means:
- Alex can always see Alex's accounts (shared or private)
- Jordan can see Alex's accounts only if `is_shared = true`
- Jordan can always see Jordan's own accounts

## Invitation Flow

```
Alex registers → Household "Johnson Household" auto-created → Alex is owner

Alex visits Settings → Invite Partner → enters jordan@example.com
  ↓
POST /api/v1/households/mine/invite
  { email: "jordan@...", role: "editor" }
  ↓
Invitation created with a signed JWT token (7-day expiry)
Email sent to jordan@example.com with accept link

Jordan clicks link → /invite/{token}
  ↓
GET /api/v1/households/invite/{token} — preview (no auth required)
  ↓
Jordan fills registration form
POST /api/v1/auth/invite/accept { token, password, full_name }
  ↓
Jordan's User created (or existing user linked)
HouseholdMember created linking Jordan to the Household
Invitation marked "accepted"
  ↓
Jordan logs in → Sees shared accounts and shared view
```

## "Mine / Yours / Ours" Dashboard Views

The dashboard supports three views:

- **Ours**: All shared accounts for the household
- **Mine**: Only accounts where `owner_id == current_user.id`
- **Yours**: Only partner's shared accounts (i.e., `is_shared=true` and `owner_id != current_user.id`)

## Shared vs. Personal Budgets and Goals

- `scope = "household"`: Both members see and contribute to this item
- `scope = "personal"`: Only the creator sees it

## Activity Feed

The household activity feed (in Insights) shows major events:
- "Alex linked a new account"
- "Jordan accepted your invitation"
- "New budget created by Alex"
- "Emergency fund goal reached 80%"

## Privacy Guardrails

1. The invite flow never reuses passwords — each partner creates their own credentials
2. Private accounts are invisible to partners at the API level, not just UI level
3. An `AuditLog` records every permission change, account link/disconnect, and invitation event
4. Partners cannot remove each other's accounts
5. Only the `owner` can change household membership roles
6. Removing a partner removes their household membership but does not delete their user account or their personal accounts

## Relationship-Safe UX

Design principles:
- Never show "who spent more" comparisons in inflammatory ways
- Insights about one partner's spending use neutral language ("Household member A spent...")
- Private mode is easily discoverable and respected — no dark patterns
- Either partner can leave the household at any time without losing their personal data
