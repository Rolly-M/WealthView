"""
Insight Engine: automatically generates proactive financial insight cards
after each sync and on-demand.
"""

import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.insight import Insight
from app.models.transaction import Transaction


class InsightEngine:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def generate_for_household(self, household_id: uuid.UUID) -> list[Insight]:
        insights = []
        today = date.today()
        month_start = today.replace(day=1)
        last_month_start = (month_start - timedelta(days=1)).replace(day=1)
        last_month_end = month_start - timedelta(days=1)

        # Fetch visible account IDs
        acct_result = await self.db.execute(
            select(Account.id).where(Account.household_id == household_id, Account.is_active == True)
        )
        account_ids = [r[0] for r in acct_result.all()]

        if not account_ids:
            return []

        # ── 1. Spending spike by category ──────────────────────────────────
        cat_this = await self._spending_by_category(account_ids, month_start, today)
        cat_last = await self._spending_by_category(account_ids, last_month_start, last_month_end)

        for cat, current in cat_this.items():
            previous = cat_last.get(cat, Decimal("0"))
            if previous > 0:
                pct = (current - previous) / previous * 100
                if pct > 20 and current > 50:
                    insights.append(
                        Insight(
                            household_id=household_id,
                            type="category_trend",
                            title=f"{cat.replace('_', ' ').title()} up {pct:.0f}% this month",
                            body=(
                                f"You've spent ${current:.0f} on {cat.replace('_', ' ')} this month, "
                                f"compared to ${previous:.0f} last month — a {pct:.0f}% increase."
                            ),
                            severity="warning" if pct > 40 else "info",
                            category=cat,
                            amount=float(current),
                            amount_change=float(current - previous),
                            pct_change=float(pct),
                        )
                    )

        # ── 2. Top spending category ───────────────────────────────────────
        if cat_this:
            top_cat = max(cat_this, key=lambda c: cat_this[c])
            top_amount = cat_this[top_cat]
            insights.append(
                Insight(
                    household_id=household_id,
                    type="spending_spike",
                    title=f"Highest spend: {top_cat.replace('_', ' ').title()}",
                    body=(
                        f"Your largest spending category this month is "
                        f"{top_cat.replace('_', ' ')} at ${top_amount:.0f}."
                    ),
                    severity="info",
                    category=top_cat,
                    amount=float(top_amount),
                )
            )

        # ── 3. Savings rate ────────────────────────────────────────────────
        income_result = await self.db.execute(
            select(func.sum(func.abs(Transaction.amount))).where(
                Transaction.account_id.in_(account_ids),
                Transaction.date >= month_start,
                Transaction.is_income == True,
                Transaction.is_hidden == False,
            )
        )
        income = income_result.scalar() or Decimal("0")

        spending_result = await self.db.execute(
            select(func.sum(Transaction.amount)).where(
                Transaction.account_id.in_(account_ids),
                Transaction.date >= month_start,
                Transaction.is_income == False,
                Transaction.is_transfer == False,
                Transaction.is_hidden == False,
                Transaction.amount > 0,
            )
        )
        spending = spending_result.scalar() or Decimal("0")

        if income > 0:
            savings_rate = float((income - spending) / income * 100)
            severity = "positive" if savings_rate >= 20 else ("warning" if savings_rate < 10 else "info")
            insights.append(
                Insight(
                    household_id=household_id,
                    type="cash_flow",
                    title=f"Savings rate: {savings_rate:.1f}% this month",
                    body=(
                        f"You've saved ${float(income - spending):.0f} of your ${float(income):.0f} income "
                        f"({savings_rate:.1f}%). "
                        + ("Great work!" if savings_rate >= 20 else "Consider reducing discretionary spending.")
                    ),
                    severity=severity,
                    amount=float(income - spending),
                    pct_change=savings_rate,
                )
            )

        # ── 4. Recurring subscription count ──────────────────────────────
        sub_result = await self.db.execute(
            select(func.count(Transaction.id)).where(
                Transaction.account_id.in_(account_ids),
                Transaction.is_subscription == True,
                Transaction.date >= month_start,
            )
        )
        sub_count = sub_result.scalar() or 0
        if sub_count > 0:
            sub_amt_result = await self.db.execute(
                select(func.sum(Transaction.amount)).where(
                    Transaction.account_id.in_(account_ids),
                    Transaction.is_subscription == True,
                    Transaction.date >= month_start,
                )
            )
            sub_total = sub_amt_result.scalar() or Decimal("0")
            insights.append(
                Insight(
                    household_id=household_id,
                    type="subscription_alert",
                    title=f"{sub_count} active subscriptions detected",
                    body=(
                        f"We found {sub_count} recurring subscriptions totalling ${float(sub_total):.0f}/month. "
                        "Review them to find potential savings."
                    ),
                    severity="info",
                    amount=float(sub_total),
                )
            )

        # Persist new insights (avoid duplicates by type in current month)
        existing_types = await self.db.execute(
            select(Insight.type).where(
                Insight.household_id == household_id,
                Insight.created_at >= month_start,
            )
        )
        skip_types = {r[0] for r in existing_types.all()}

        saved = []
        for ins in insights:
            if ins.type not in skip_types:
                self.db.add(ins)
                saved.append(ins)
        await self.db.commit()
        return saved

    async def _spending_by_category(
        self,
        account_ids: list,
        start: date,
        end: date,
    ) -> dict[str, Decimal]:
        result = await self.db.execute(
            select(Transaction.category, func.sum(Transaction.amount)).where(
                Transaction.account_id.in_(account_ids),
                Transaction.date >= start,
                Transaction.date <= end,
                Transaction.is_income == False,
                Transaction.is_transfer == False,
                Transaction.is_hidden == False,
                Transaction.amount > 0,
            ).group_by(Transaction.category)
        )
        return {row[0]: row[1] for row in result.all()}
