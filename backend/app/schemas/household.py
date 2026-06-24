import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr

from app.schemas.user import UserOut


class HouseholdOut(BaseModel):
    id: uuid.UUID
    name: str
    currency: str
    country: str
    created_at: datetime

    model_config = {"from_attributes": True}


class HouseholdCreate(BaseModel):
    name: str
    currency: str = "USD"
    country: str = "US"


class HouseholdUpdate(BaseModel):
    name: str | None = None
    currency: str | None = None
    country: str | None = None


class MemberOut(BaseModel):
    id: uuid.UUID
    user: UserOut
    role: str
    nickname: str | None
    share_all_accounts: bool
    joined_at: datetime

    model_config = {"from_attributes": True}


class InviteCreate(BaseModel):
    email: EmailStr
    role: str = "editor"
    message: str | None = None


class InvitationOut(BaseModel):
    id: uuid.UUID
    email: str
    role: str
    status: str
    expires_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class HouseholdWithMembers(HouseholdOut):
    members: list[MemberOut] = []
    pending_invitations: list[InvitationOut] = []
