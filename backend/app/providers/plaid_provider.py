"""
Plaid bank provider.
Only active when ENABLE_PLAID=true and PLAID_CLIENT_ID / PLAID_SECRET are set.
"""

# TODO: Fill in Plaid credentials in .env to enable live bank connections.

from app.core.config import settings
from app.providers.base import BankProvider


class PlaidProvider(BankProvider):
    def __init__(self):
        import plaid
        from plaid.api import plaid_api
        from plaid.model.products import Products
        from plaid.model.country_code import CountryCode

        configuration = plaid.Configuration(
            host={
                "sandbox": plaid.Environment.Sandbox,
                "development": plaid.Environment.Development,
                "production": plaid.Environment.Production,
            }.get(settings.PLAID_ENV, plaid.Environment.Sandbox),
            api_key={
                "clientId": settings.PLAID_CLIENT_ID,
                "secret": settings.PLAID_SECRET,
            },
        )
        api_client = plaid.ApiClient(configuration)
        self.client = plaid_api.PlaidApi(api_client)

    async def create_link_token(self, user_id: str) -> dict:
        from plaid.model.link_token_create_request import LinkTokenCreateRequest
        from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
        from plaid.model.products import Products
        from plaid.model.country_code import CountryCode

        request = LinkTokenCreateRequest(
            products=[Products("transactions")],
            client_name="WealthView Duo",
            country_codes=[CountryCode("US"), CountryCode("CA")],
            language="en",
            user=LinkTokenCreateRequestUser(client_user_id=user_id),
        )
        response = self.client.link_token_create(request)
        return {"link_token": response["link_token"]}

    async def exchange_token_and_get_accounts(
        self, public_token: str | None, user_id: str, household_id: str
    ) -> list[dict]:
        from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
        from plaid.model.accounts_get_request import AccountsGetRequest

        exchange_resp = self.client.item_public_token_exchange(
            ItemPublicTokenExchangeRequest(public_token=public_token)
        )
        access_token = exchange_resp["access_token"]

        accounts_resp = self.client.accounts_get(AccountsGetRequest(access_token=access_token))
        item_resp = self.client.item_get({"access_token": access_token})

        results = []
        for acc in accounts_resp["accounts"]:
            results.append({
                "provider_account_id": acc["account_id"],
                "access_token": access_token,
                "name": acc["name"],
                "official_name": acc.get("official_name"),
                "type": acc["type"].value,
                "subtype": acc["subtype"].value if acc.get("subtype") else None,
                "currency": acc["balances"].get("iso_currency_code", "USD"),
                "current_balance": acc["balances"].get("current", 0),
                "available_balance": acc["balances"].get("available"),
                "credit_limit": acc["balances"].get("limit"),
                "institution": {
                    "provider_id": item_resp["item"]["institution_id"],
                    "name": "Unknown",
                    "provider": "plaid",
                },
            })
        return results

    async def fetch_transactions(
        self, access_token: str, start_date: str, end_date: str
    ) -> list[dict]:
        from plaid.model.transactions_get_request import TransactionsGetRequest
        from plaid.model.transactions_get_request_options import TransactionsGetRequestOptions
        import datetime

        request = TransactionsGetRequest(
            access_token=access_token,
            start_date=datetime.date.fromisoformat(start_date),
            end_date=datetime.date.fromisoformat(end_date),
        )
        response = self.client.transactions_get(request)
        results = []
        for txn in response["transactions"]:
            results.append({
                "provider_transaction_id": txn["transaction_id"],
                "amount": txn["amount"],
                "date": str(txn["date"]),
                "merchant_name": txn.get("merchant_name"),
                "description": txn.get("name", ""),
                "category": txn["category"][0].lower().replace(" ", "_") if txn.get("category") else None,
                "is_pending": txn.get("pending", False),
                "is_income": txn["amount"] < 0,
                "is_transfer": "transfer" in str(txn.get("category", [])).lower(),
                "is_recurring": False,
                "is_subscription": False,
            })
        return results

    async def get_balance(self, access_token: str, account_id: str) -> dict:
        from plaid.model.accounts_balance_get_request import AccountsBalanceGetRequest
        response = self.client.accounts_balance_get(
            AccountsBalanceGetRequest(access_token=access_token)
        )
        for acc in response["accounts"]:
            if acc["account_id"] == account_id:
                return {
                    "current_balance": acc["balances"]["current"],
                    "available_balance": acc["balances"].get("available"),
                }
        return {"current_balance": 0}
