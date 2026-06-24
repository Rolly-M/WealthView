from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_db, get_household_for_user
from app.models.account import Account
from app.models.household import Household
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.transaction import (
    SpendingSummary,
    TransactionOut,
    TransactionUpdate,
    SpendingByCategory,
)

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _visible_account_ids(accounts, user_id: str) -> list:
    return [a.id for a in accounts if a.is_shared or str(a.owner_id) == user_id]


@router.get("", response_model=list[TransactionOut])
async def list_transactions(
    account_id: str | None = Query(None),
    category: str | None = Query(None),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    search: str | None = Query(None),
    is_income: bool | None = Query(None),
    is_recurring: bool | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_active_user),
    household: Household = Depends(get_household_for_user),
    db: AsyncSession = Depends(get_db),
):
    acct_result = await db.execute(
        select(Account).where(Account.household_id == household.id, Account.is_active == True)
    )
    accounts = acct_result.scalars().all()
    visible_ids = _visible_account_ids(accounts, str(user.id))

    filters = [
        Transaction.account_id.in_(visible_ids),
        Transaction.is_hidden == False,
    ]
    if account_id:
        filters.append(Transaction.account_id == account_id)
    if category:
        filters.append(Transaction.category == category)
    if start_date:
        filters.append(Transaction.date >= start_date)
    if end_date:
        filters.append(Transaction.date <= end_date)
    if is_income is not None:
        filters.append(Transaction.is_income == is_income)
    if is_recurring is not None:
        filters.append(Transaction.is_recurring == is_recurring)
    if search:
        filters.append(
            or_(
                Transaction.description.ilike(f"%{search}%"),
                Transaction.merchant_name.ilike(f"%{search}%"),
                Transaction.merchant_normalized.ilike(f"%{search}%"),
            )
        )

    result = await db.execute(
        select(Transaction)
        .where(and_(*filters))
        .order_by(Transaction.date.desc(), Transaction.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return result.scalars().all()


@router.patch("/{transaction_id}", response_model=TransactionOut)
async def update_transaction(
    transaction_id: str,
    body: TransactionUpdate,
    user: User = Depends(get_current_active_user),
    household: Household = Depends(get_household_for_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Transaction).where(
            Transaction.id == transaction_id,
            Transaction.household_id == household.id,
        )
    )
    txn = result.scalar_one_or_none()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    updates = body.model_dump(exclude_unset=True)
    if "category" in updates:
        txn.category = updates["category"]
        txn.category_source = "user"
        txn.category_confidence = 1.0
        txn.category_explanation = "Manually recategorized by user"
    for field, value in updates.items():
        if field != "category":
            setattr(txn, field, value)

    db.add(txn)
    await db.commit()
    await db.refresh(txn)
    return txn


@router.get("/summary", response_model=SpendingSummary)
async def spending_summary(
    start_date: date = Query(...),
    end_date: date = Query(...),
    user: User = Depends(get_current_active_user),
    household: Household = Depends(get_household_for_user),
    db: AsyncSession = Depends(get_db),
):
    acct_result = await db.execute(
        select(Account).where(Account.household_id == household.id, Account.is_active == True)
    )
    accounts = acct_result.scalars().all()
    visible_ids = _visible_account_ids(accounts, str(user.id))

    result = await db.execute(
        select(Transaction).where(
            Transaction.account_id.in_(visible_ids),
            Transaction.date >= start_date,
            Transaction.date <= end_date,
            Transaction.is_hidden == False,
            Transaction.is_transfer == False,
        )
    )
    txns = result.scalars().all()

    income = sum(abs(t.amount) for t in txns if t.is_income)
    spent = sum(t.amount for t in txns if not t.is_income and t.amount > 0)
    savings = income - spent

    by_cat: dict[str, list] = {}
    for t in txns:
        if not t.is_income:
            by_cat.setdefault(t.category, []).append(float(t.amount))

    total = float(spent) or 1.0
    categories = [
        SpendingByCategory(
            category=cat,
            total=sum(amounts),
            count=len(amounts),
            pct_of_total=round(sum(amounts) / total * 100, 1),
        )
        for cat, amounts in sorted(by_cat.items(), key=lambda x: sum(x[1]), reverse=True)
    ]

    return SpendingSummary(
        period_start=start_date,
        period_end=end_date,
        total_spent=spent,
        total_income=income,
        savings=savings,
        savings_rate=round(float(savings) / float(income) * 100, 1) if income else 0.0,
        by_category=categories,
        transaction_count=len(txns),
    )
