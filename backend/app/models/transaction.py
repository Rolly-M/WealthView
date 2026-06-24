import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

CATEGORIES = [
    "housing", "groceries", "dining", "transportation", "utilities",
    "insurance", "debt_payment", "savings", "investing", "entertainment",
    "health", "shopping", "income", "transfer", "subscription",
    "travel", "education", "personal_care", "gifts", "miscellaneous",
]


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
    )
    household_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    provider_transaction_id: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    merchant_name: Mapped[str | None] = mapped_column(String(255))
    merchant_normalized: Mapped[str | None] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(50), default="miscellaneous", index=True)
    category_confidence: Mapped[float] = mapped_column(default=0.0)
    category_source: Mapped[str] = mapped_column(
        Enum("rule", "ml", "user", "provider", name="category_source"), default="ml"
    )
    category_explanation: Mapped[str | None] = mapped_column(Text)
    is_pending: Mapped[bool] = mapped_column(Boolean, default=False)
    is_transfer: Mapped[bool] = mapped_column(Boolean, default=False)
    is_recurring: Mapped[bool] = mapped_column(Boolean, default=False)
    is_subscription: Mapped[bool] = mapped_column(Boolean, default=False)
    is_income: Mapped[bool] = mapped_column(Boolean, default=False)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str | None] = mapped_column(Text)
    tags: Mapped[list] = mapped_column(JSONB, default=list)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    account: Mapped["Account"] = relationship(back_populates="transactions")
    household: Mapped["Household"] = relationship()


class TransactionRule(Base):
    __tablename__ = "transaction_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    household_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    match_field: Mapped[str] = mapped_column(
        Enum("merchant_name", "description", "amount", name="rule_match_field"), nullable=False
    )
    match_operator: Mapped[str] = mapped_column(
        Enum("contains", "equals", "starts_with", "ends_with", "greater_than", "less_than",
             name="rule_operator"), nullable=False
    )
    match_value: Mapped[str] = mapped_column(String(255), nullable=False)
    set_category: Mapped[str | None] = mapped_column(String(50))
    set_recurring: Mapped[bool | None] = mapped_column(Boolean)
    set_hidden: Mapped[bool | None] = mapped_column(Boolean)
    priority: Mapped[int] = mapped_column(default=100)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    household: Mapped["Household"] = relationship()
    created_by: Mapped["User"] = relationship()
