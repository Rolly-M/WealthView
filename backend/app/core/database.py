from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


def _build_engine():
    """Build the async engine; add SSL connect_args for hosted PostgreSQL."""
    kwargs: dict = {
        "echo": settings.DEBUG,
        "pool_pre_ping": True,
        "pool_size": 5,
        "max_overflow": 10,
    }

    # Railway, Render, and Supabase require SSL on their managed databases.
    # The URL will already contain ?sslmode=require; asyncpg reads it automatically.
    # Explicit connect_args are only needed when the URL does NOT include sslmode.
    if settings.ENVIRONMENT == "production" and "sslmode" not in settings.DATABASE_URL:
        kwargs["connect_args"] = {"ssl": "require"}

    return create_async_engine(settings.DATABASE_URL, **kwargs)


engine = _build_engine()

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
