from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_active_user, get_db, get_household_for_user
from app.core.security import create_invite_token
from app.models.household import Household, HouseholdMember, Invitation
from app.models.user import User
from app.schemas.household import (
    HouseholdCreate,
    HouseholdOut,
    HouseholdUpdate,
    HouseholdWithMembers,
    InviteCreate,
    InvitationOut,
    MemberOut,
)

router = APIRouter(prefix="/households", tags=["households"])


@router.get("/mine", response_model=HouseholdWithMembers)
async def get_my_household(
    household: Household = Depends(get_household_for_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Household)
        .where(Household.id == household.id)
        .options(
            selectinload(Household.members).selectinload(HouseholdMember.user),
            selectinload(Household.invitations),
        )
    )
    h = result.scalar_one()
    pending = [inv for inv in h.invitations if inv.status == "pending"]
    return HouseholdWithMembers(
        id=h.id,
        name=h.name,
        currency=h.currency,
        country=h.country,
        created_at=h.created_at,
        members=[MemberOut.model_validate(m) for m in h.members],
        pending_invitations=[InvitationOut.model_validate(i) for i in pending],
    )


@router.patch("/mine", response_model=HouseholdOut)
async def update_household(
    body: HouseholdUpdate,
    household: Household = Depends(get_household_for_user),
    db: AsyncSession = Depends(get_db),
):
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(household, field, value)
    db.add(household)
    await db.commit()
    await db.refresh(household)
    return household


@router.post("/mine/invite", response_model=InvitationOut, status_code=201)
async def invite_partner(
    body: InviteCreate,
    user: User = Depends(get_current_active_user),
    household: Household = Depends(get_household_for_user),
    db: AsyncSession = Depends(get_db),
):
    token = create_invite_token(str(household.id), str(user.id), body.email)
    invitation = Invitation(
        household_id=household.id,
        inviter_id=user.id,
        email=body.email,
        role=body.role,
        token=token,
        message=body.message,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(invitation)
    await db.commit()
    await db.refresh(invitation)
    return invitation


@router.get("/invite/{token}")
async def preview_invite(token: str):
    from app.core.security import decode_invite_token
    try:
        data = decode_invite_token(token)
        return {"email": data["email"], "household_id": data["household_id"], "valid": True}
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or expired invite")


@router.delete("/mine/members/{member_id}", status_code=204)
async def remove_member(
    member_id: str,
    user: User = Depends(get_current_active_user),
    household: Household = Depends(get_household_for_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(HouseholdMember).where(
            HouseholdMember.id == member_id,
            HouseholdMember.household_id == household.id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    if str(member.user_id) == str(user.id):
        raise HTTPException(status_code=400, detail="Cannot remove yourself")
    await db.delete(member)
    await db.commit()
