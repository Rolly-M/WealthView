from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_invite_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.household import Household, HouseholdMember, Invitation
from app.models.user import User, RefreshToken
from app.schemas.auth import InviteAcceptRequest, LoginRequest, RefreshRequest, RegisterRequest, TokenResponse
from app.schemas.user import UserOut
from app.core.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])


def _make_token_response(user_id: str) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user_id),
        refresh_token=create_refresh_token(user_id),
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        is_verified=True,
    )
    db.add(user)
    await db.flush()

    # Create a default household for the new user
    household = Household(name=f"{body.full_name.split()[0]}'s Household")
    db.add(household)
    await db.flush()

    membership = HouseholdMember(household_id=household.id, user_id=user.id, role="owner")
    db.add(membership)
    await db.commit()

    return _make_token_response(str(user.id))


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()

    return _make_token_response(str(user.id))


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    try:
        payload = decode_token(body.refresh_token)
        if payload.get("type") != "refresh":
            raise ValueError()
        user_id = payload["sub"]
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    result = await db.execute(select(User).where(User.id == user_id, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return _make_token_response(str(user.id))


@router.post("/invite/accept", response_model=TokenResponse)
async def accept_invite(body: InviteAcceptRequest, db: AsyncSession = Depends(get_db)):
    try:
        data = decode_invite_token(body.token)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or expired invite token")

    result = await db.execute(
        select(Invitation).where(Invitation.token == body.token, Invitation.status == "pending")
    )
    invitation = result.scalar_one_or_none()
    if not invitation:
        raise HTTPException(status_code=400, detail="Invitation not found or already used")
    if invitation.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Invitation expired")

    existing = await db.execute(select(User).where(User.email == data["email"]))
    user = existing.scalar_one_or_none()

    if user is None:
        user = User(
            email=data["email"],
            hashed_password=hash_password(body.password),
            full_name=body.full_name,
            is_verified=True,
        )
        db.add(user)
        await db.flush()

    existing_member = await db.execute(
        select(HouseholdMember).where(
            HouseholdMember.household_id == invitation.household_id,
            HouseholdMember.user_id == user.id,
        )
    )
    if not existing_member.scalar_one_or_none():
        membership = HouseholdMember(
            household_id=invitation.household_id,
            user_id=user.id,
            role=invitation.role,
        )
        db.add(membership)

    invitation.status = "accepted"
    invitation.accepted_at = datetime.now(timezone.utc)
    await db.commit()

    return _make_token_response(str(user.id))
