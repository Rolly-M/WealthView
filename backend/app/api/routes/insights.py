from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_db, get_household_for_user
from app.models.household import Household
from app.models.insight import Insight
from app.models.user import User
from app.schemas.insight import InsightAction, InsightOut
from app.services.insight_engine import InsightEngine

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("", response_model=list[InsightOut])
async def list_insights(
    include_dismissed: bool = Query(False),
    limit: int = Query(20, ge=1, le=100),
    household: Household = Depends(get_household_for_user),
    db: AsyncSession = Depends(get_db),
):
    filters = [Insight.household_id == household.id]
    if not include_dismissed:
        filters.append(Insight.is_dismissed == False)

    result = await db.execute(
        select(Insight)
        .where(*filters)
        .order_by(Insight.created_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


@router.post("/{insight_id}/action", response_model=InsightOut)
async def act_on_insight(
    insight_id: str,
    body: InsightAction,
    household: Household = Depends(get_household_for_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Insight).where(Insight.id == insight_id, Insight.household_id == household.id)
    )
    insight = result.scalar_one_or_none()
    if not insight:
        raise HTTPException(status_code=404, detail="Insight not found")

    if body.action == "read":
        insight.is_read = True
    elif body.action == "dismiss":
        insight.is_dismissed = True
    elif body.action == "save":
        insight.is_saved = True
    else:
        raise HTTPException(status_code=400, detail="Invalid action")

    db.add(insight)
    await db.commit()
    await db.refresh(insight)
    return insight


@router.post("/generate", status_code=202)
async def trigger_insights(
    user: User = Depends(get_current_active_user),
    household: Household = Depends(get_household_for_user),
    db: AsyncSession = Depends(get_db),
):
    engine = InsightEngine(db)
    await engine.generate_for_household(household.id)
    return {"message": "Insight generation triggered"}
