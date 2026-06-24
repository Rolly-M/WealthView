import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class InstitutionOut(BaseModel):
    id: uuid.UUID
    name: str
    logo_url: str | None
    primary_color: str | None
    country: str

    model_config = {"from_attributes": True}


class AccountOut(BaseModel):
    id: uuid.UUID
    name: str
    official_name: str | None
    type: str
    subtype: str | None
    currency: str
    current_balance: Decimal
    available_balance: Decimal | None
    credit_limit: Decimal | None
    is_shared: bool
    is_active: bool
    include_in_net_worth: bool
    last_synced_at: datetime | None
    institution: InstitutionOut | None
    owner_id: uuid.UUID
    provider: str

    model_config = {"from_attributes": True}


class AccountCreate(BaseModel):
    provider: str = "mock"
    public_token: str | None = None
    name: str | None = None


class AccountUpdate(BaseModel):
    name: str | None = None
    is_shared: bool | None = None
    include_in_net_worth: bool | None = None


class SyncJobOut(BaseModel):
    id: uuid.UUID
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    transactions_added: int
    transactions_updated: int
    error_message: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class NetWorthSummary(BaseModel):
    total_assets: Decimal
    total_liabilities: Decimal
    net_worth: Decimal
    accounts_by_type: dict[str, list[AccountOut]]
