from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_db, get_household_for_user
from app.models.goal import Goal, GoalContribution
from app.models.household import Household
from app.models.user import User
from app.schemas.goal import GoalContributionCreate, GoalCreate, GoalOut, GoalUpdate

router = APIRouter(prefix="/goals", tags=["goals"])


@router.get("", response_model=list[GoalOut])
async def list_goals(
    household: Household = Depends(get_household_for_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Goal).where(Goal.household_id == household.id, Goal.status != "cancelled")
    )
    return result.scalars().all()


@router.post("", response_model=GoalOut, status_code=201)
async def create_goal(
    body: GoalCreate,
    user: User = Depends(get_current_active_user),
    household: Household = Depends(get_household_for_user),
    db: AsyncSession = Depends(get_db),
):
    goal = Goal(household_id=household.id, created_by_id=user.id, **body.model_dump())
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return goal


@router.patch("/{goal_id}", response_model=GoalOut)
async def update_goal(
    goal_id: str,
    body: GoalUpdate,
    household: Household = Depends(get_household_for_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Goal).where(Goal.id == goal_id, Goal.household_id == household.id)
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(goal, field, value)
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return goal


@router.post("/{goal_id}/contribute", response_model=GoalOut)
async def add_contribution(
    goal_id: str,
    body: GoalContributionCreate,
    household: Household = Depends(get_household_for_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Goal).where(Goal.id == goal_id, Goal.household_id == household.id)
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    contribution = GoalContribution(goal_id=goal.id, **body.model_dump())
    db.add(contribution)
    goal.current_amount += body.amount
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return goal
