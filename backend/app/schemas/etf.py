import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class ETFMetricsOut(BaseModel):
    as_of_date: date
    price: Decimal | None
    aum_millions: Decimal | None
    expense_ratio: Decimal | None
    dividend_yield: Decimal | None
    dividend_yield_ttm: Decimal | None
    dividend_growth_1y: Decimal | None
    dividend_growth_3y: Decimal | None
    dividend_growth_5y: Decimal | None
    return_1m: Decimal | None
    return_3m: Decimal | None
    return_ytd: Decimal | None
    return_1y: Decimal | None
    return_3y_annualized: Decimal | None
    return_5y_annualized: Decimal | None
    volatility_1y: Decimal | None
    sharpe_ratio_1y: Decimal | None
    beta: Decimal | None
    pe_ratio: Decimal | None
    pb_ratio: Decimal | None
    holdings_count: int | None
    top_holdings: list
    sector_allocation: dict
    geographic_allocation: dict
    distribution_history: list
    why_featured: str | None
    research_notes: str | None

    model_config = {"from_attributes": True}


class ETFSecurityOut(BaseModel):
    id: uuid.UUID
    ticker: str
    name: str
    description: str | None
    exchange: str | None
    currency: str
    country: str
    issuer: str | None
    category: str | None
    focus: str | None
    tags: list
    latest_metrics: ETFMetricsOut | None

    model_config = {"from_attributes": True}


class ETFFilter(BaseModel):
    min_yield: float | None = None
    max_expense_ratio: float | None = None
    min_return_1y: float | None = None
    region: str | None = None
    category: str | None = None
    search: str | None = None
    page: int = 1
    page_size: int = 20


class WatchlistItemOut(BaseModel):
    id: uuid.UUID
    security: ETFSecurityOut
    notes: str | None
    added_at: datetime

    model_config = {"from_attributes": True}
