"""
Finance Chat Service.

Answers natural-language questions about the household's financial data.
Uses OpenAI when configured, otherwise falls back to a deterministic
rule-based responder that queries the database directly.
"""

import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.account import Account
from app.models.transaction import Transaction


SUGGESTED_PROMPTS = [
    "What did we spend the most on this month?",
    "How much did we save in the last 90 days?",
    "Which subscriptions should we cancel?",
    "What were our biggest transactions last month?",
    "How much cash do we have available after bills?",
    "What category increased the most this quarter?",
    "What's our savings rate this year?",
    "Show me all dining transactions this month.",
]


class ChatService:
    def __init__(self, db: AsyncSession, household_id: uuid.UUID):
        self.db = db
        self.household_id = household_id

    async def answer(
        self, question: str, thread_id: uuid.UUID
    ) -> tuple[str, list, list[str]]:
        """Returns (answer_text, sources, suggested_followups)."""
        if settings.ENABLE_OPENAI_CHAT and settings.OPENAI_API_KEY:
            return await self._openai_answer(question)
        return await self._rule_based_answer(question.lower())

    async def _rule_based_answer(self, q: str) -> tuple[str, list, list[str]]:
        today = date.today()
        month_start = today.replace(day=1)

        account_ids = await self._get_account_ids()
        sources = []
        followups = SUGGESTED_PROMPTS[:3]

        # ── Spending this month ─────────────────────────────────────────────
        if "spend" in q and ("this month" in q or "month" in q):
            cat_spend = await self._category_spend(account_ids, month_start, today)
            if not cat_spend:
                return "I don't see any spending transactions this month yet.", sources, followups
            top = sorted(cat_spend.items(), key=lambda x: x[1], reverse=True)[:5]
            lines = "\n".join(f"- {k.replace('_', ' ').title()}: ${v:.2f}" for k, v in top)
            return (
                f"Here's your spending breakdown for {today.strftime('%B %Y')}:\n\n{lines}\n\n"
                f"Total: ${sum(cat_spend.values()):.2f}",
                sources,
                ["What did we spend on groceries?", "Which is my largest expense?", "How does this compare to last month?"],
            )

        # ── Savings ─────────────────────────────────────────────────────────
        if "sav" in q:
            days = 90 if "90" in q else 30
            start = today - timedelta(days=days)
            income, spending = await self._income_and_spending(account_ids, start, today)
            savings = income - spending
            rate = float(savings / income * 100) if income else 0
            return (
                f"Over the last {days} days:\n"
                f"- Income: ${float(income):.2f}\n"
                f"- Spending: ${float(spending):.2f}\n"
                f"- Savings: ${float(savings):.2f} ({rate:.1f}% savings rate)",
                sources,
                followups,
            )

        # ── Cash available ───────────────────────────────────────────────────
        if "cash" in q or "available" in q or "balance" in q:
            balances = await self._liquid_balances(account_ids)
            total = sum(v for _, v in balances)
            lines = "\n".join(f"- {name}: ${bal:.2f}" for name, bal in balances)
            return (
                f"Your current liquid balances:\n\n{lines}\n\nTotal available: ${float(total):.2f}",
                sources,
                ["How much did we spend this month?", "What bills are coming up?"],
            )

        # ── Subscriptions ────────────────────────────────────────────────────
        if "subscri" in q:
            subs = await self._subscriptions(account_ids, month_start, today)
            if not subs:
                return "No subscriptions detected this month.", sources, followups
            lines = "\n".join(f"- {name}: ${amt:.2f}/mo" for name, amt in subs)
            total = sum(a for _, a in subs)
            return (
                f"Active subscriptions detected this month:\n\n{lines}\n\nTotal: ${total:.2f}/month\n\n"
                "Review any you no longer use to save money.",
                sources,
                ["Show me all recurring charges.", "What's my biggest subscription?"],
            )

        # ── Biggest transactions ─────────────────────────────────────────────
        if "biggest" in q or "largest" in q:
            period_start = (today.replace(day=1) - timedelta(days=1)).replace(day=1) if "last month" in q else month_start
            period_end = today if "this month" in q or "last month" not in q else today.replace(day=1) - timedelta(days=1)
            txns = await self._top_transactions(account_ids, period_start, period_end)
            if not txns:
                return "No transactions found for that period.", sources, followups
            lines = "\n".join(f"- {desc}: ${amt:.2f} ({dt})" for desc, amt, dt in txns)
            return f"Largest transactions:\n\n{lines}", sources, followups

        # ── Category increase ────────────────────────────────────────────────
        if "increas" in q or "went up" in q:
            last_month_start = (month_start - timedelta(days=1)).replace(day=1)
            last_month_end = month_start - timedelta(days=1)
            this = await self._category_spend(account_ids, month_start, today)
            last = await self._category_spend(account_ids, last_month_start, last_month_end)
            increases = {}
            for cat, val in this.items():
                prev = last.get(cat, Decimal("0"))
                if prev > 0:
                    increases[cat] = float((val - prev) / prev * 100)
            if not increases:
                return "Not enough data to compare months yet.", sources, followups
            top_cat = max(increases, key=increases.get)
            pct = increases[top_cat]
            return (
                f"The category with the biggest increase is **{top_cat.replace('_', ' ').title()}** "
                f"— up {pct:.0f}% compared to last month.",
                sources,
                followups,
            )

        # ── Default ──────────────────────────────────────────────────────────
        return (
            "I can help with questions about your spending, savings, balances, subscriptions, "
            "and trends. Try asking:\n\n"
            + "\n".join(f"- {p}" for p in SUGGESTED_PROMPTS[:5]),
            sources,
            SUGGESTED_PROMPTS[:3],
        )

    async def _get_account_ids(self) -> list:
        result = await self.db.execute(
            select(Account.id).where(
                Account.household_id == self.household_id,
                Account.is_active == True,
            )
        )
        return [r[0] for r in result.all()]

    async def _category_spend(self, account_ids, start, end) -> dict[str, Decimal]:
        result = await self.db.execute(
            select(Transaction.category, func.sum(Transaction.amount))
            .where(
                Transaction.account_id.in_(account_ids),
                Transaction.date >= start,
                Transaction.date <= end,
                Transaction.is_income == False,
                Transaction.is_transfer == False,
                Transaction.is_hidden == False,
                Transaction.amount > 0,
            )
            .group_by(Transaction.category)
        )
        return {r[0]: r[1] for r in result.all()}

    async def _income_and_spending(self, account_ids, start, end):
        income_res = await self.db.execute(
            select(func.sum(func.abs(Transaction.amount))).where(
                Transaction.account_id.in_(account_ids),
                Transaction.date >= start,
                Transaction.date <= end,
                Transaction.is_income == True,
            )
        )
        spend_res = await self.db.execute(
            select(func.sum(Transaction.amount)).where(
                Transaction.account_id.in_(account_ids),
                Transaction.date >= start,
                Transaction.date <= end,
                Transaction.is_income == False,
                Transaction.is_transfer == False,
                Transaction.amount > 0,
            )
        )
        return income_res.scalar() or Decimal("0"), spend_res.scalar() or Decimal("0")

    async def _liquid_balances(self, account_ids):
        result = await self.db.execute(
            select(Account.name, Account.current_balance).where(
                Account.id.in_(account_ids),
                Account.type.in_(["checking", "savings"]),
                Account.is_active == True,
            )
        )
        return result.all()

    async def _subscriptions(self, account_ids, start, end):
        result = await self.db.execute(
            select(Transaction.merchant_normalized, func.avg(Transaction.amount))
            .where(
                Transaction.account_id.in_(account_ids),
                Transaction.date >= start,
                Transaction.date <= end,
                Transaction.is_subscription == True,
            )
            .group_by(Transaction.merchant_normalized)
            .order_by(func.avg(Transaction.amount).desc())
        )
        return [(r[0] or "Unknown", float(r[1])) for r in result.all()]

    async def _top_transactions(self, account_ids, start, end, limit=5):
        result = await self.db.execute(
            select(Transaction.merchant_normalized, Transaction.amount, Transaction.date)
            .where(
                Transaction.account_id.in_(account_ids),
                Transaction.date >= start,
                Transaction.date <= end,
                Transaction.is_hidden == False,
                Transaction.amount > 0,
            )
            .order_by(Transaction.amount.desc())
            .limit(limit)
        )
        return [(r[0] or "Unknown", float(r[1]), str(r[2])) for r in result.all()]

    async def _openai_answer(self, question: str) -> tuple[str, list, list[str]]:
        """LLM-powered answer using financial data as context. TODO when OPENAI_API_KEY set."""
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

        account_ids = await self._get_account_ids()
        today = date.today()
        month_start = today.replace(day=1)
        cat_spend = await self._category_spend(account_ids, month_start, today)
        income, spending = await self._income_and_spending(account_ids, month_start, today)

        context = (
            f"Today: {today}\n"
            f"This month income: ${float(income):.2f}\n"
            f"This month spending: ${float(spending):.2f}\n"
            f"Spending by category: {dict(cat_spend)}\n"
        )
        system_prompt = (
            "You are a helpful, friendly financial assistant for a couples budgeting app. "
            "Answer questions based ONLY on the provided financial data context. "
            "Never provide individualized investment advice. Be concise and accurate. "
            "If asked about investments, say you can provide general information only."
        )
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Financial context:\n{context}\n\nQuestion: {question}"},
            ],
            max_tokens=500,
        )
        answer = response.choices[0].message.content
        return answer, [], SUGGESTED_PROMPTS[:3]
