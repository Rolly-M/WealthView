import uuid
from datetime import datetime

from pydantic import BaseModel


class InsightOut(BaseModel):
    id: uuid.UUID
    type: str
    title: str
    body: str
    severity: str
    category: str | None
    amount: float | None
    amount_change: float | None
    pct_change: float | None
    is_read: bool
    is_dismissed: bool
    is_saved: bool
    metadata_: dict
    created_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


class InsightAction(BaseModel):
    action: str  # "read" | "dismiss" | "save"
