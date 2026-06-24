from collections.abc import AsyncGenerator

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import decode_token
from app.models.household import Household, HouseholdMember
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise ValueError("Not an access token")
        user_id = payload["sub"]
    except (ValueError, KeyError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    result = await db.execute(
        select(User)
        .where(User.id == user_id, User.is_active == True)
        .options(selectinload(User.household_memberships).selectinload(HouseholdMember.household))
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


async def get_current_active_user(user: User = Depends(get_current_user)) -> User:
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")
    return user


async def get_household_for_user(
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> Household:
    if not user.household_memberships:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No household found. Please create or join one.",
        )
    return user.household_memberships[0].household


async def require_household_owner(
    user: User = Depends(get_current_active_user),
    household: Household = Depends(get_household_for_user),
) -> tuple[User, Household]:
    membership = next(
        (m for m in user.household_memberships if m.household_id == household.id), None
    )
    if membership is None or membership.role != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Owner role required")
    return user, household
