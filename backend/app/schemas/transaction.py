import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class TransactionOut(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    amount: Decimal
    currency: str
    date: date
    merchant_name: str | None
    merchant_normalized: str | None
    description: str
    category: str
    category_confidence: float
    category_source: str
    category_explanation: str | None
    is_pending: bool
    is_transfer: bool
    is_recurring: bool
    is_subscription: bool
    is_income: bool
    notes: str | None
    tags: list
    created_at: datetime

    model_config = {"from_attributes": True}


class TransactionUpdate(BaseModel):
    category: str | None = None
    notes: str | None = None
    tags: list[str] | None = None
    is_hidden: bool | None = None
    merchant_normalized: str | None = None


class TransactionFilter(BaseModel):
    account_id: uuid.UUID | None = None
    category: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    min_amount: Decimal | None = None
    max_amount: Decimal | None = None
    search: str | None = None
    is_income: bool | None = None
    is_recurring: bool | None = None
    page: int = 1
    page_size: int = 50


class SpendingByCategory(BaseModel):
    category: str
    total: Decimal
    count: int
    pct_of_total: float


class SpendingSummary(BaseModel):
    period_start: date
    period_end: date
    total_spent: Decimal
    total_income: Decimal
    savings: Decimal
    savings_rate: float
    by_category: list[SpendingByCategory]
    transaction_count: int


class TransactionRuleCreate(BaseModel):
    name: str
    match_field: str
    match_operator: str
    match_value: str
    set_category: str | None = None
    set_recurring: bool | None = None
    set_hidden: bool | None = None
    priority: int = 100
