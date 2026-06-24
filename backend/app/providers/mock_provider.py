"""
Mock bank provider for demo mode.
Returns realistic demo data without any external API calls.
"""

import random
import uuid
from datetime import date, timedelta
from decimal import Decimal

from app.providers.base import BankProvider


MOCK_INSTITUTIONS = [
    {
        "provider_id": "mock_td",
        "name": "TD Bank",
        "logo_url": None,
        "primary_color": "#2ecc71",
        "country": "US",
        "provider": "mock",
    },
    {
        "provider_id": "mock_chase",
        "name": "Chase",
        "logo_url": None,
        "primary_color": "#117ACA",
        "country": "US",
        "provider": "mock",
    },
]

MOCK_ACCOUNTS = [
    {
        "provider_account_id": "mock_acc_chk_001",
        "name": "Joint Checking",
        "official_name": "TD Everyday Chequing",
        "type": "checking",
        "subtype": "checking",
        "currency": "USD",
        "current_balance": Decimal("4850.22"),
        "available_balance": Decimal("4830.00"),
        "institution": MOCK_INSTITUTIONS[0],
        "access_token": "mock_access_token_001",
    },
    {
        "provider_account_id": "mock_acc_sav_001",
        "name": "High-Interest Savings",
        "official_name": "TD High Interest Savings",
        "type": "savings",
        "subtype": "savings",
        "currency": "USD",
        "current_balance": Decimal("18_450.00"),
        "available_balance": Decimal("18_450.00"),
        "institution": MOCK_INSTITUTIONS[0],
        "access_token": "mock_access_token_002",
    },
    {
        "provider_account_id": "mock_acc_cc_001",
        "name": "Cashback Visa",
        "official_name": "Chase Freedom Unlimited",
        "type": "credit",
        "subtype": "credit card",
        "currency": "USD",
        "current_balance": Decimal("-1_234.56"),
        "available_balance": Decimal("8_765.44"),
        "credit_limit": Decimal("10_000.00"),
        "institution": MOCK_INSTITUTIONS[1],
        "access_token": "mock_access_token_003",
    },
]

MOCK_TRANSACTIONS_TEMPLATES = [
    ("PAYROLL DIRECT DEP", -4200.00, "income", True, False, False),
    ("PAYROLL DIRECT DEP", -3800.00, "income", True, False, False),
    ("Rent", 1850.00, "housing", False, True, False),
    ("NETFLIX", 15.99, "subscription", False, False, True),
    ("SPOTIFY", 10.99, "subscription", False, False, True),
    ("Amazon Prime", 14.99, "subscription", False, False, True),
    ("Whole Foods Market", 142.30, "groceries", False, False, False),
    ("Whole Foods Market", 98.10, "groceries", False, False, False),
    ("Starbucks", 7.50, "dining", False, False, False),
    ("Chipotle Mexican Grill", 24.60, "dining", False, False, False),
    ("The Keg", 89.40, "dining", False, False, False),
    ("Shell Gas Station", 72.00, "transportation", False, False, False),
    ("Uber", 18.50, "transportation", False, False, False),
    ("Shoppers Drug Mart", 43.20, "health", False, False, False),
    ("HYDRO One", 134.00, "utilities", False, True, False),
    ("Rogers Wireless", 80.00, "utilities", False, True, False),
    ("TD Insurance", 180.00, "insurance", False, True, False),
    ("Amazon.ca", 67.99, "shopping", False, False, False),
    ("Indigo Books", 32.00, "shopping", False, False, False),
    ("Cineplex Entertainment", 45.00, "entertainment", False, False, False),
    ("Apple Store", 1299.00, "shopping", False, False, False),
    ("Questrade", 500.00, "investing", False, False, False),
    ("Emergency Fund Transfer", 300.00, "savings", False, True, False),
    ("Loblaws Superstore", 210.00, "groceries", False, False, False),
    ("VISA Payment Thank You", -1200.00, "transfer", False, True, False),
    ("Life Insurance Co", 85.00, "insurance", False, True, False),
    ("Yoga Studio", 60.00, "health", False, True, False),
    ("Airbnb", 320.00, "travel", False, False, False),
    ("WestJet Airlines", 480.00, "travel", False, False, False),
]


class MockProvider(BankProvider):
    async def create_link_token(self, user_id: str) -> dict:
        return {"link_token": f"mock_link_{uuid.uuid4().hex}", "expiration": "2024-12-31"}

    async def exchange_token_and_get_accounts(
        self, public_token: str | None, user_id: str, household_id: str
    ) -> list[dict]:
        return MOCK_ACCOUNTS

    async def fetch_transactions(
        self, access_token: str, start_date: str, end_date: str
    ) -> list[dict]:
        start = date.fromisoformat(start_date)
        end = date.fromisoformat(end_date)
        txns = []
        current = start
        idx = 0
        while current <= end:
            templates_today = random.sample(
                MOCK_TRANSACTIONS_TEMPLATES,
                k=min(random.randint(1, 4), len(MOCK_TRANSACTIONS_TEMPLATES))
            )
            for template in templates_today:
                desc, amount, cat, is_income, is_recurring, is_subscription = template
                jitter = Decimal(str(round(random.uniform(-0.05, 0.05) * abs(amount), 2)))
                txns.append({
                    "provider_transaction_id": f"mock_txn_{uuid.uuid4().hex}",
                    "amount": Decimal(str(amount)) + jitter,
                    "date": str(current),
                    "merchant_name": desc,
                    "description": desc,
                    "category": cat,
                    "is_income": is_income,
                    "is_recurring": is_recurring,
                    "is_subscription": is_subscription,
                    "is_pending": False,
                    "is_transfer": cat == "transfer",
                })
            current += timedelta(days=1)
        return txns

    async def get_balance(self, access_token: str, account_id: str) -> dict:
        for acc in MOCK_ACCOUNTS:
            if acc["provider_account_id"] == account_id:
                return {
                    "current_balance": acc["current_balance"],
                    "available_balance": acc.get("available_balance"),
                }
        return {"current_balance": Decimal("0"), "available_balance": Decimal("0")}
