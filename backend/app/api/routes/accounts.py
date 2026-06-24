from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_active_user, get_db, get_household_for_user
from app.models.account import Account, Institution
from app.models.household import Household
from app.models.user import User
from app.providers.base import get_provider
from app.schemas.account import AccountCreate, AccountOut, AccountUpdate, NetWorthSummary, SyncJobOut

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", response_model=list[AccountOut])
async def list_accounts(
    household: Household = Depends(get_household_for_user),
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Account)
        .where(Account.household_id == household.id, Account.is_active == True)
        .options(selectinload(Account.institution))
    )
    accounts = result.scalars().all()
    # Filter: only shared accounts OR accounts owned by this user
    visible = [
        a for a in accounts
        if a.is_shared or str(a.owner_id) == str(user.id)
    ]
    return visible


@router.post("/link", response_model=list[AccountOut], status_code=201)
async def link_accounts(
    body: AccountCreate,
    user: User = Depends(get_current_active_user),
    household: Household = Depends(get_household_for_user),
    db: AsyncSession = Depends(get_db),
):
    provider = get_provider(body.provider)
    accounts_data = await provider.exchange_token_and_get_accounts(
        public_token=body.public_token,
        user_id=str(user.id),
        household_id=str(household.id),
    )
    created = []
    for acc_data in accounts_data:
        institution = None
        if acc_data.get("institution"):
            inst_result = await db.execute(
                select(Institution).where(Institution.provider_id == acc_data["institution"]["provider_id"])
            )
            institution = inst_result.scalar_one_or_none()
            if not institution:
                institution = Institution(**acc_data["institution"], provider=body.provider)
                db.add(institution)
                await db.flush()

        account = Account(
            household_id=household.id,
            owner_id=user.id,
            institution_id=institution.id if institution else None,
            provider=body.provider,
            provider_account_id=acc_data["provider_account_id"],
            provider_access_token=acc_data.get("access_token"),
            name=acc_data["name"],
            official_name=acc_data.get("official_name"),
            type=acc_data["type"],
            subtype=acc_data.get("subtype"),
            currency=acc_data.get("currency", "USD"),
            current_balance=acc_data.get("current_balance", 0),
            available_balance=acc_data.get("available_balance"),
            credit_limit=acc_data.get("credit_limit"),
        )
        db.add(account)
        await db.flush()
        created.append(account)

    await db.commit()
    for a in created:
        await db.refresh(a)
    return created


@router.patch("/{account_id}", response_model=AccountOut)
async def update_account(
    account_id: str,
    body: AccountUpdate,
    user: User = Depends(get_current_active_user),
    household: Household = Depends(get_household_for_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Account)
        .where(Account.id == account_id, Account.household_id == household.id)
        .options(selectinload(Account.institution))
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(account, field, value)
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return account


@router.delete("/{account_id}", status_code=204)
async def disconnect_account(
    account_id: str,
    user: User = Depends(get_current_active_user),
    household: Household = Depends(get_household_for_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Account).where(
            Account.id == account_id,
            Account.household_id == household.id,
            Account.owner_id == user.id,
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    account.is_active = False
    db.add(account)
    await db.commit()


@router.get("/net-worth", response_model=NetWorthSummary)
async def get_net_worth(
    household: Household = Depends(get_household_for_user),
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Account)
        .where(Account.household_id == household.id, Account.is_active == True, Account.include_in_net_worth == True)
        .options(selectinload(Account.institution))
    )
    accounts = result.scalars().all()
    visible = [a for a in accounts if a.is_shared or str(a.owner_id) == str(user.id)]

    assets = sum(a.current_balance for a in visible if a.type in ("checking", "savings", "investment"))
    liabilities = sum(abs(a.current_balance) for a in visible if a.type in ("credit", "loan", "mortgage"))

    by_type: dict[str, list] = {}
    for a in visible:
        by_type.setdefault(a.type, []).append(AccountOut.model_validate(a))

    return NetWorthSummary(
        total_assets=assets,
        total_liabilities=liabilities,
        net_worth=assets - liabilities,
        accounts_by_type=by_type,
    )
