# Bank Integration

## Provider Abstraction

All bank integrations implement `BankProvider` in `backend/app/providers/base.py`:

```python
class BankProvider(ABC):
    async def create_link_token(self, user_id: str) -> dict: ...
    async def exchange_token_and_get_accounts(...) -> list[dict]: ...
    async def fetch_transactions(...) -> list[dict]: ...
    async def get_balance(...) -> dict: ...
```

The active provider is selected in `get_provider()`:
- `ENABLE_PLAID=true` + credentials set → PlaidProvider
- Otherwise → MockProvider (demo mode)

## Mock Provider

`MockProvider` returns realistic demo data with no external calls:
- 3 demo accounts: Joint Checking, High-Interest Savings, Cashback Visa
- Generates realistic daily transaction patterns from a template library
- Deterministic, reproducible — seeded once at startup

## Plaid Integration

### Setup

1. Create a Plaid account at https://plaid.com
2. Get `client_id` and `secret` from the Plaid dashboard
3. Set environment variables:

```
ENABLE_PLAID=true
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_secret_key
PLAID_ENV=sandbox  # or development / production
```

### Flow

```
Frontend → POST /accounts/link with public_token
         ↓
AccountsRouter → get_provider("plaid")
         ↓
PlaidProvider.exchange_token_and_get_accounts()
  → ItemPublicTokenExchange (public_token → access_token)
  → AccountsGet (fetch account list)
  → Returns normalized account list
         ↓
Accounts stored in DB (access_token encrypted in production)
         ↓
SyncWorker picks up account, calls fetch_transactions() hourly
```

### Data Normalization

All providers return accounts in a normalized dict format:

```python
{
    "provider_account_id": str,
    "access_token": str,     # stored encrypted
    "name": str,
    "official_name": str | None,
    "type": "checking" | "savings" | "credit" | "investment" | "loan",
    "subtype": str | None,
    "currency": str,
    "current_balance": Decimal,
    "available_balance": Decimal | None,
    "credit_limit": Decimal | None,
    "institution": { "provider_id": str, "name": str, ... },
}
```

Transactions:
```python
{
    "provider_transaction_id": str,
    "amount": Decimal,   # positive = debit, negative = credit
    "date": str,         # ISO format
    "merchant_name": str | None,
    "description": str,
    "category": str | None,  # provider's own category hint
    "is_pending": bool,
    "is_income": bool,
    "is_transfer": bool,
    "is_recurring": bool,
    "is_subscription": bool,
}
```

## Security

- Access tokens from Plaid are stored server-side only
- In production, encrypt access_token using a KMS-backed key before storing
- Bank connections are **read-only** — we request only `transactions` product from Plaid
- No payment or transfer capabilities are ever requested
- Users can disconnect accounts at any time (soft-deletes the Account record)

## Adding a New Provider

1. Create `backend/app/providers/your_provider.py` extending `BankProvider`
2. Add a case in `get_provider()` in `base.py`
3. Add env vars for credentials
4. Normalize the data to match the standard dict format

The rest of the system (sync worker, categorization, insights) is provider-agnostic.

## Canadian vs US Support

- Plaid supports both US (`USD`) and Canadian (`CAD`) institutions in their respective environments
- The `Account.currency` field stores the account currency
- The `Household.country` and `Household.currency` fields drive display formatting
- ETF research includes both US and Canadian (TSX-listed) ETFs in demo data
