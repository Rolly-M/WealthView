import uuid
from datetime import datetime

from pydantic import BaseModel


class ChatMessageOut(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    sources: list
    suggested_followups: list[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatThreadOut(BaseModel):
    id: uuid.UUID
    title: str | None
    scope: str
    created_at: datetime
    updated_at: datetime
    messages: list[ChatMessageOut] = []

    model_config = {"from_attributes": True}


class ChatRequest(BaseModel):
    message: str
    thread_id: uuid.UUID | None = None
    scope: str = "household"


class ChatResponse(BaseModel):
    thread_id: uuid.UUID
    message: ChatMessageOut
