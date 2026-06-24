from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_active_user, get_db, get_household_for_user
from app.models.account import Account
from app.models.budget import Budget, BudgetCategory
from app.models.household import Household
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.budget import BudgetCreate, BudgetOut, BudgetProgress

router = APIRouter(prefix="/budgets", tags=["budgets"])


@router.get("", response_model=list[BudgetOut])
async def list_budgets(
    household: Household = Depends(get_household_for_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Budget)
        .where(Budget.household_id == household.id, Budget.is_active == True)
        .options(selectinload(Budget.categories))
    )
    return result.scalars().all()


@router.post("", response_model=BudgetOut, status_code=201)
async def create_budget(
    body: BudgetCreate,
    user: User = Depends(get_current_active_user),
    household: Household = Depends(get_household_for_user),
    db: AsyncSession = Depends(get_db),
):
    budget = Budget(
        household_id=household.id,
        created_by_id=user.id,
        name=body.name,
        period=body.period,
        scope=body.scope,
        month=body.month,
        year=body.year,
        total_amount=body.total_amount,
        rollover=body.rollover,
    )
    db.add(budget)
    await db.flush()

    for cat in body.categories:
        db.add(BudgetCategory(budget_id=budget.id, **cat.model_dump()))

    await db.commit()
    await db.refresh(budget, ["categories"])
    return budget


@router.get("/{budget_id}/progress", response_model=BudgetProgress)
async def budget_progress(
    budget_id: str,
    user: User = Depends(get_current_active_user),
    household: Household = Depends(get_household_for_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Budget)
        .where(Budget.id == budget_id, Budget.household_id == household.id)
        .options(selectinload(Budget.categories))
    )
    budget = result.scalar_one_or_none()
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")

    now = date.today()
    if budget.month and budget.year:
        start = date(budget.year, budget.month, 1)
        import calendar
        end = date(budget.year, budget.month, calendar.monthrange(budget.year, budget.month)[1])
    else:
        start = date(now.year, now.month, 1)
        end = now

    acct_result = await db.execute(
        select(Account).where(Account.household_id == household.id, Account.is_active == True)
    )
    accounts = acct_result.scalars().all()
    visible_ids = [a.id for a in accounts if a.is_shared or str(a.owner_id) == str(user.id)]

    txn_result = await db.execute(
        select(Transaction).where(
            Transaction.account_id.in_(visible_ids),
            Transaction.date >= start,
            Transaction.date <= end,
            Transaction.is_income == False,
            Transaction.is_transfer == False,
            Transaction.is_hidden == False,
        )
    )
    txns = txn_result.scalars().all()

    total_spent = sum(t.amount for t in txns)
    pct = float(total_spent / budget.total_amount * 100) if budget.total_amount else 0

    days_in_month = (end - start).days + 1
    days_remaining = max(0, (end - now).days)

    projected = None
    days_elapsed = days_in_month - days_remaining
    if days_elapsed > 0 and total_spent > 0:
        daily_rate = total_spent / days_elapsed
        projected_total = daily_rate * days_in_month
        if projected_total > budget.total_amount:
            projected = projected_total - budget.total_amount

    cat_spent: dict[str, Decimal] = {}
    for t in txns:
        cat_spent[t.category] = cat_spent.get(t.category, Decimal("0")) + t.amount

    cats_progress = [
        {
            "category": bc.category,
            "budget": float(bc.amount),
            "spent": float(cat_spent.get(bc.category, 0)),
            "pct": float(cat_spent.get(bc.category, 0) / bc.amount * 100) if bc.amount else 0,
        }
        for bc in budget.categories
    ]

    return BudgetProgress(
        budget=BudgetOut.model_validate(budget),
        total_spent=total_spent,
        total_budget=budget.total_amount,
        pct_used=round(pct, 1),
        days_remaining=days_remaining,
        projected_overspend=projected,
        categories_progress=cats_progress,
    )


@router.delete("/{budget_id}", status_code=204)
async def delete_budget(
    budget_id: str,
    household: Household = Depends(get_household_for_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Budget).where(Budget.id == budget_id, Budget.household_id == household.id)
    )
    budget = result.scalar_one_or_none()
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    budget.is_active = False
    db.add(budget)
    await db.commit()
