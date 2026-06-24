from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_active_user, get_db
from app.models.etf import ETFSecurity, ETFMetricsSnapshot, Watchlist, WatchlistItem
from app.models.user import User
from app.schemas.etf import ETFSecurityOut, WatchlistItemOut

router = APIRouter(prefix="/etf", tags=["etf"])


@router.get("/screen", response_model=list[ETFSecurityOut])
async def screen_etfs(
    min_yield: float | None = Query(None),
    max_expense_ratio: float | None = Query(None),
    min_return_1y: float | None = Query(None),
    category: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ETFSecurity)
        .where(ETFSecurity.is_active == True)
        .options(selectinload(ETFSecurity.metrics_snapshots))
    )
    securities = result.scalars().all()

    filtered = []
    for sec in securities:
        m = sec.latest_metrics
        if not m:
            continue
        if search and search.lower() not in sec.ticker.lower() and search.lower() not in sec.name.lower():
            continue
        if category and sec.category != category:
            continue
        if min_yield is not None and (m.dividend_yield is None or float(m.dividend_yield) < min_yield):
            continue
        if max_expense_ratio is not None and (m.expense_ratio is None or float(m.expense_ratio) > max_expense_ratio):
            continue
        if min_return_1y is not None and (m.return_1y is None or float(m.return_1y) < min_return_1y):
            continue
        filtered.append(sec)

    # Sort by dividend yield desc
    filtered.sort(
        key=lambda s: float(s.latest_metrics.dividend_yield or 0),
        reverse=True,
    )

    start = (page - 1) * page_size
    return filtered[start: start + page_size]


@router.get("/featured", response_model=list[ETFSecurityOut])
async def featured_etfs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ETFSecurity)
        .where(ETFSecurity.is_active == True, ETFSecurity.tags.contains(["featured"]))
        .options(selectinload(ETFSecurity.metrics_snapshots))
        .limit(10)
    )
    return result.scalars().all()


@router.get("/{ticker}", response_model=ETFSecurityOut)
async def get_etf(ticker: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ETFSecurity)
        .where(ETFSecurity.ticker == ticker.upper())
        .options(selectinload(ETFSecurity.metrics_snapshots))
    )
    sec = result.scalar_one_or_none()
    if not sec:
        raise HTTPException(status_code=404, detail="ETF not found")
    return sec


@router.get("/watchlist/mine", response_model=list[WatchlistItemOut])
async def get_watchlist(
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Watchlist)
        .where(Watchlist.user_id == user.id)
        .options(
            selectinload(Watchlist.items)
            .selectinload(WatchlistItem.security)
            .selectinload(ETFSecurity.metrics_snapshots)
        )
        .limit(1)
    )
    watchlist = result.scalar_one_or_none()
    if not watchlist:
        return []
    return watchlist.items


@router.post("/watchlist/{ticker}", status_code=201)
async def add_to_watchlist(
    ticker: str,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    sec_result = await db.execute(
        select(ETFSecurity).where(ETFSecurity.ticker == ticker.upper())
    )
    security = sec_result.scalar_one_or_none()
    if not security:
        raise HTTPException(status_code=404, detail="ETF not found")

    wl_result = await db.execute(select(Watchlist).where(Watchlist.user_id == user.id).limit(1))
    watchlist = wl_result.scalar_one_or_none()
    if not watchlist:
        watchlist = Watchlist(user_id=user.id)
        db.add(watchlist)
        await db.flush()

    existing = await db.execute(
        select(WatchlistItem).where(
            WatchlistItem.watchlist_id == watchlist.id,
            WatchlistItem.security_id == security.id,
        )
    )
    if existing.scalar_one_or_none():
        return {"message": "Already in watchlist"}

    item = WatchlistItem(watchlist_id=watchlist.id, security_id=security.id)
    db.add(item)
    await db.commit()
    return {"message": "Added to watchlist"}


@router.delete("/watchlist/{ticker}", status_code=204)
async def remove_from_watchlist(
    ticker: str,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    sec_result = await db.execute(
        select(ETFSecurity).where(ETFSecurity.ticker == ticker.upper())
    )
    security = sec_result.scalar_one_or_none()
    if not security:
        raise HTTPException(status_code=404, detail="ETF not found")

    wl_result = await db.execute(select(Watchlist).where(Watchlist.user_id == user.id).limit(1))
    watchlist = wl_result.scalar_one_or_none()
    if not watchlist:
        return

    item_result = await db.execute(
        select(WatchlistItem).where(
            WatchlistItem.watchlist_id == watchlist.id,
            WatchlistItem.security_id == security.id,
        )
    )
    item = item_result.scalar_one_or_none()
    if item:
        await db.delete(item)
        await db.commit()
