import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr


class UserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    avatar_url: str | None
    currency: str
    locale: str
    is_verified: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    full_name: str | None = None
    avatar_url: str | None = None
    currency: str | None = None
    locale: str | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str
