import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class GoalCreate(BaseModel):
    name: str
    description: str | None = None
    type: str
    target_amount: Decimal
    current_amount: Decimal = Decimal("0.00")
    monthly_contribution: Decimal | None = None
    target_date: date | None = None
    emoji: str | None = None
    color: str | None = None
    scope: str = "household"


class GoalOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    type: str
    target_amount: Decimal
    current_amount: Decimal
    monthly_contribution: Decimal | None
    target_date: date | None
    emoji: str | None
    color: str | None
    scope: str
    status: str
    progress_pct: float
    completed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class GoalContributionCreate(BaseModel):
    amount: Decimal
    contributed_at: date
    note: str | None = None
    transaction_id: uuid.UUID | None = None


class GoalUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    target_amount: Decimal | None = None
    monthly_contribution: Decimal | None = None
    target_date: date | None = None
    status: str | None = None
