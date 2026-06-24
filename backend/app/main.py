import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import auth, users, households, accounts, transactions, budgets, goals, insights, chat, etf
from app.core.config import settings

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("wealthview")


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting WealthView Duo API (env=%s, demo=%s)", settings.ENVIRONMENT, settings.DEMO_MODE)

    # Run database migrations on startup
    try:
        from alembic import command
        from alembic.config import Config as AlembicConfig
        alembic_cfg = AlembicConfig("alembic.ini")
        alembic_cfg.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
        command.upgrade(alembic_cfg, "head")
        logger.info("Database migrations applied")
    except Exception as exc:
        logger.warning("Alembic migration failed (%s); attempting create_all fallback", exc)
        # Fallback: create all tables directly (useful for first-run with no migration files)
        from app.core.database import engine
        from app.models import Base  # noqa: F401 — ensures all models are registered
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Tables created via create_all fallback")

    # Seed demo data only in demo mode
    if settings.DEMO_MODE:
        try:
            from app.seed.demo_data import seed_demo_data
            await seed_demo_data()
        except Exception as exc:
            logger.error("Demo seed failed: %s", exc)

    yield

    logger.info("Shutting down WealthView Duo API")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="WealthView Duo API",
    description="Couples budgeting and financial intelligence platform.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if not (settings.ENVIRONMENT == "production") else None,
    redoc_url="/redoc" if not (settings.ENVIRONMENT == "production") else None,
    openapi_url="/openapi.json" if not (settings.ENVIRONMENT == "production") else None,
)

# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------

# CORS — allow configured origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Trusted host (prevent Host header injection in production)
if settings.ENVIRONMENT == "production":
    allowed_hosts = ["*"]  # tighten to your domain if desired
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts)


# Request timing middleware (development only)
if settings.DEBUG:
    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        t0 = time.perf_counter()
        response = await call_next(request)
        ms = (time.perf_counter() - t0) * 1000
        logger.debug("%s %s → %d (%.1fms)", request.method, request.url.path, response.status_code, ms)
        return response


# ---------------------------------------------------------------------------
# Global exception handler
# ---------------------------------------------------------------------------
@app.exception_handler(Exception)
async def unhandled_exception(request: Request, exc: Exception):
    logger.exception("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred."},
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
for router in [
    auth.router,
    users.router,
    households.router,
    accounts.router,
    transactions.router,
    budgets.router,
    goals.router,
    insights.router,
    chat.router,
    etf.router,
]:
    app.include_router(router, prefix="/api/v1")


# ---------------------------------------------------------------------------
# Utility endpoints
# ---------------------------------------------------------------------------
@app.get("/health", tags=["ops"])
async def health():
    return {
        "status": "ok",
        "environment": settings.ENVIRONMENT,
        "demo_mode": settings.DEMO_MODE,
    }


@app.get("/api/v1/demo/credentials", tags=["ops"])
async def demo_credentials():
    """Expose demo login info when in demo mode (safe for public sandbox)."""
    if not settings.DEMO_MODE:
        return {"demo_mode": False}
    return {
        "demo_mode": True,
        "users": [
            {"email": "alex@demo.wealthviewduo.com", "password": "demo1234!", "role": "owner"},
            {"email": "jordan@demo.wealthviewduo.com", "password": "demo1234!", "role": "partner"},
        ],
    }
