"""
Pluggable bank provider abstraction.
All providers must implement BankProvider.
"""

from abc import ABC, abstractmethod
from typing import Any


class BankProvider(ABC):
    """Abstract bank aggregation provider."""

    @abstractmethod
    async def create_link_token(self, user_id: str) -> dict:
        """Create a link token for the institution picker UI."""

    @abstractmethod
    async def exchange_token_and_get_accounts(
        self, public_token: str | None, user_id: str, household_id: str
    ) -> list[dict]:
        """
        Exchange a public token for an access token, then fetch accounts.
        Returns normalized account dicts.
        """

    @abstractmethod
    async def fetch_transactions(
        self, access_token: str, start_date: str, end_date: str
    ) -> list[dict]:
        """Fetch transactions for an account. Returns normalized transaction dicts."""

    @abstractmethod
    async def get_balance(self, access_token: str, account_id: str) -> dict:
        """Fetch current balance for a specific account."""


def get_provider(provider_name: str) -> BankProvider:
    from app.core.config import settings

    if provider_name == "plaid" and settings.ENABLE_PLAID:
        from app.providers.plaid_provider import PlaidProvider
        return PlaidProvider()

    from app.providers.mock_provider import MockProvider
    return MockProvider()
