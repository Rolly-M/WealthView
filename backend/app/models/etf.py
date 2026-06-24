import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ETFSecurity(Base):
    __tablename__ = "etf_securities"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticker: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    exchange: Mapped[str | None] = mapped_column(String(50))
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    country: Mapped[str] = mapped_column(String(2), default="US")
    issuer: Mapped[str | None] = mapped_column(String(100))
    category: Mapped[str | None] = mapped_column(String(100))
    focus: Mapped[str | None] = mapped_column(String(100))
    tags: Mapped[list] = mapped_column(JSONB, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    data_source: Mapped[str] = mapped_column(String(50), default="mock")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    metrics_snapshots: Mapped[list["ETFMetricsSnapshot"]] = relationship(
        back_populates="security", cascade="all, delete-orphan"
    )
    watchlist_items: Mapped[list["WatchlistItem"]] = relationship(back_populates="security")

    @property
    def latest_metrics(self):
        if self.metrics_snapshots:
            return sorted(self.metrics_snapshots, key=lambda m: m.as_of_date, reverse=True)[0]
        return None


class ETFMetricsSnapshot(Base):
    __tablename__ = "etf_metrics_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    security_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("etf_securities.id", ondelete="CASCADE"), nullable=False
    )
    as_of_date: Mapped[date] = mapped_column(Date, nullable=False)
    price: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    nav: Mapped[Decimal | None] = mapped_column(Numeric(12, 4))
    aum_millions: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    expense_ratio: Mapped[Decimal | None] = mapped_column(Numeric(6, 4))
    dividend_yield: Mapped[Decimal | None] = mapped_column(Numeric(6, 4))
    dividend_yield_ttm: Mapped[Decimal | None] = mapped_column(Numeric(6, 4))
    dividend_growth_1y: Mapped[Decimal | None] = mapped_column(Numeric(6, 4))
    dividend_growth_3y: Mapped[Decimal | None] = mapped_column(Numeric(6, 4))
    dividend_growth_5y: Mapped[Decimal | None] = mapped_column(Numeric(6, 4))
    return_1m: Mapped[Decimal | None] = mapped_column(Numeric(8, 4))
    return_3m: Mapped[Decimal | None] = mapped_column(Numeric(8, 4))
    return_ytd: Mapped[Decimal | None] = mapped_column(Numeric(8, 4))
    return_1y: Mapped[Decimal | None] = mapped_column(Numeric(8, 4))
    return_3y_annualized: Mapped[Decimal | None] = mapped_column(Numeric(8, 4))
    return_5y_annualized: Mapped[Decimal | None] = mapped_column(Numeric(8, 4))
    volatility_1y: Mapped[Decimal | None] = mapped_column(Numeric(8, 4))
    sharpe_ratio_1y: Mapped[Decimal | None] = mapped_column(Numeric(8, 4))
    beta: Mapped[Decimal | None] = mapped_column(Numeric(8, 4))
    pe_ratio: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    pb_ratio: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    holdings_count: Mapped[int | None]
    top_holdings: Mapped[list] = mapped_column(JSONB, default=list)
    sector_allocation: Mapped[dict] = mapped_column(JSONB, default=dict)
    geographic_allocation: Mapped[dict] = mapped_column(JSONB, default=dict)
    distribution_history: Mapped[list] = mapped_column(JSONB, default=list)
    why_featured: Mapped[str | None] = mapped_column(Text)
    research_notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    security: Mapped["ETFSecurity"] = relationship(back_populates="metrics_snapshots")


class Watchlist(Base):
    __tablename__ = "watchlists"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="My Watchlist")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="watchlists")
    items: Mapped[list["WatchlistItem"]] = relationship(back_populates="watchlist", cascade="all, delete-orphan")


class WatchlistItem(Base):
    __tablename__ = "watchlist_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    watchlist_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("watchlists.id", ondelete="CASCADE"), nullable=False
    )
    security_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("etf_securities.id", ondelete="CASCADE"), nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    watchlist: Mapped["Watchlist"] = relationship(back_populates="items")
    security: Mapped["ETFSecurity"] = relationship(back_populates="watchlist_items")
