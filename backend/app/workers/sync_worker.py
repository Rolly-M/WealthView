"""
Background sync worker. Runs periodically to fetch new transactions
for all active accounts and trigger insight generation.
"""

import asyncio
import logging
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.models.account import Account, SyncJob
from app.models.transaction import Transaction
from app.providers.base import get_provider
from app.services.categorization import apply_user_rules, classify_transaction, normalize_merchant
from app.services.insight_engine import InsightEngine

logger = logging.getLogger(__name__)


async def sync_account(account: Account, db):
    job = SyncJob(account_id=account.id, status="running")
    db.add(job)
    await db.flush()

    try:
        provider = get_provider(account.provider)
        end_date = date.today()
        start_date = (account.last_synced_at.date() if account.last_synced_at else end_date - timedelta(days=30))

        raw_txns = await provider.fetch_transactions(
            access_token=account.provider_access_token or "",
            start_date=str(start_date),
            end_date=str(end_date),
        )

        added = updated = 0
        for raw in raw_txns:
            existing = await db.execute(
                select(Transaction).where(
                    Transaction.provider_transaction_id == raw["provider_transaction_id"]
                )
            )
            txn = existing.scalar_one_or_none()

            cat_result = classify_transaction(
                description=raw.get("description", ""),
                merchant_name=raw.get("merchant_name"),
                amount=raw["amount"],
                provider_category=raw.get("category"),
            )

            if txn is None:
                txn = Transaction(
                    account_id=account.id,
                    household_id=account.household_id,
                    provider_transaction_id=raw["provider_transaction_id"],
                    amount=raw["amount"],
                    currency=raw.get("currency", "USD"),
                    date=date.fromisoformat(raw["date"]),
                    merchant_name=raw.get("merchant_name"),
                    merchant_normalized=normalize_merchant(raw.get("merchant_name")),
                    description=raw.get("description", ""),
                    category=cat_result.category,
                    category_confidence=cat_result.confidence,
                    category_source=cat_result.source,
                    category_explanation=cat_result.explanation,
                    is_income=raw.get("is_income", False),
                    is_recurring=raw.get("is_recurring", False),
                    is_subscription=raw.get("is_subscription", False),
                    is_transfer=raw.get("is_transfer", False),
                    is_pending=raw.get("is_pending", False),
                )
                db.add(txn)
                added += 1
            else:
                txn.is_pending = raw.get("is_pending", False)
                db.add(txn)
                updated += 1

        job.status = "success"
        job.transactions_added = added
        job.transactions_updated = updated
        from datetime import datetime, timezone
        account.last_synced_at = datetime.now(timezone.utc)
        db.add(account)
        logger.info(f"Synced {account.name}: +{added} added, {updated} updated")

    except Exception as exc:
        job.status = "failed"
        job.error_message = str(exc)
        logger.error(f"Sync failed for account {account.id}: {exc}")

    db.add(job)
    await db.commit()


async def run_sync_loop():
    logger.info("Sync worker started")
    while True:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Account).where(Account.is_active == True)
            )
            accounts = result.scalars().all()

            for account in accounts:
                await sync_account(account, db)

            # Generate insights for all households
            household_ids = {a.household_id for a in accounts}
            engine = InsightEngine(db)
            for h_id in household_ids:
                try:
                    await engine.generate_for_household(h_id)
                except Exception as exc:
                    logger.error(f"Insight generation failed for household {h_id}: {exc}")

        await asyncio.sleep(3600)  # Sync every hour


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_sync_loop())
