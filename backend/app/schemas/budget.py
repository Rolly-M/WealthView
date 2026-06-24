import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class BudgetCategoryCreate(BaseModel):
    category: str
    amount: Decimal
    rollover: bool = False


class BudgetCreate(BaseModel):
    name: str
    period: str = "monthly"
    scope: str = "household"
    month: int | None = None
    year: int | None = None
    total_amount: Decimal
    rollover: bool = False
    categories: list[BudgetCategoryCreate] = []


class BudgetCategoryOut(BaseModel):
    id: uuid.UUID
    category: str
    amount: Decimal
    rollover: bool

    model_config = {"from_attributes": True}


class BudgetOut(BaseModel):
    id: uuid.UUID
    name: str
    period: str
    scope: str
    month: int | None
    year: int | None
    total_amount: Decimal
    rollover: bool
    is_active: bool
    categories: list[BudgetCategoryOut]
    created_at: datetime

    model_config = {"from_attributes": True}


class BudgetProgress(BaseModel):
    budget: BudgetOut
    total_spent: Decimal
    total_budget: Decimal
    pct_used: float
    days_remaining: int
    projected_overspend: Decimal | None
    categories_progress: list[dict]
