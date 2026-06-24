from functools import lru_cache
from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    APP_NAME: str = "WealthView Duo"
    ENVIRONMENT: Literal["development", "staging", "production"] = "development"

    @property
    def DEBUG(self) -> bool:
        return self.ENVIRONMENT == "development"

    # Database — accepts both plain and ?sslmode= URLs from Railway/Render
    DATABASE_URL: str = (
        "postgresql+asyncpg://wealthview:wealthview_secret@localhost:5432/wealthview_duo"
    )

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def fix_database_url(cls, v: str) -> str:
        """
        Railway/Render sometimes supply postgres:// (sync) URLs.
        Convert to the asyncpg scheme and strip unsupported params.
        """
        if v.startswith("postgres://"):
            v = v.replace("postgres://", "postgresql+asyncpg://", 1)
        if v.startswith("postgresql://") and "asyncpg" not in v:
            v = v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    # Redis — Upstash supplies rediss:// (TLS); handle both
    REDIS_URL: str = "redis://localhost:6379/0"

    # Security
    SECRET_KEY: str = "dev_secret_key_change_in_production_32chars_minimum"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Demo / Feature flags
    DEMO_MODE: bool = True
    ENABLE_PLAID: bool = False
    ENABLE_OPENAI_CHAT: bool = False
    ENABLE_REAL_ETF_DATA: bool = False

    # Plaid
    PLAID_CLIENT_ID: str = ""
    PLAID_SECRET: str = ""
    PLAID_ENV: str = "sandbox"

    # OpenAI
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o"

    # Email
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    EMAIL_FROM: str = "noreply@wealthviewduo.com"

    # Frontend / CORS
    FRONTEND_URL: str = "http://localhost:3000"
    # Comma-separated list of allowed origins
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors(cls, v):
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @model_validator(mode="after")
    def validate_production(self):
        if self.ENVIRONMENT == "production":
            if self.SECRET_KEY.startswith("dev_"):
                raise ValueError(
                    "SECRET_KEY must not use the dev default in production. "
                    "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(32))\""
                )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
