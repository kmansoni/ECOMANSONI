"""Application configuration via Pydantic Settings.

All configuration is loaded from environment variables or a .env file.
Secrets are never hardcoded; defaults are safe for development only.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, PostgresDsn, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central application configuration.

    All values can be overridden via environment variables or .env file.
    Sensitive defaults raise errors in production mode.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ──────────────────────────────────────────────────────────
    app_name: str = Field(default="Task Management API", description="Application display name")
    app_version: str = Field(default="1.0.0")
    environment: Literal["development", "staging", "production"] = Field(default="development")
    debug: bool = Field(default=False)

    # ── Database ─────────────────────────────────────────────────────────────
    database_url: PostgresDsn = Field(
        ...,
        description="Async PostgreSQL DSN",
    )
    db_pool_min_size: int = Field(default=5, ge=1, le=50)
    db_pool_max_size: int = Field(default=20, ge=5, le=100)
    db_echo_sql: bool = Field(default=False, description="Log all SQL queries (dev only)")

    # ── JWT ───────────────────────────────────────────────────────────────────
    jwt_secret_key: str = Field(
        ...,
        min_length=32,
        description="HS256 signing secret; use RS256 private key path in production",
    )
    jwt_algorithm: str = Field(default="HS256")
    jwt_access_token_expire_minutes: int = Field(default=60, ge=5, le=1440)
    jwt_refresh_token_expire_days: int = Field(default=30, ge=1, le=90)

    # ── Security ─────────────────────────────────────────────────────────────
    bcrypt_rounds: int = Field(default=12, ge=10, le=14, description="bcrypt cost factor")
    cors_allowed_origins: list[str] = Field(
        default=["http://localhost:3000", "http://localhost:5173"],
        description="Allowed CORS origins",
    )

    # ── Rate Limiting ─────────────────────────────────────────────────────────
    rate_limit_requests_per_minute: int = Field(default=60, ge=10, le=1000)
    rate_limit_burst: int = Field(default=10, ge=5, le=100)
    redis_url: str = Field(default="redis://localhost:6379/0", description="Redis for rate limiting")

    # ── Pagination ────────────────────────────────────────────────────────────
    default_page_size: int = Field(default=20, ge=1, le=100)
    max_page_size: int = Field(default=100, ge=10, le=500)

    @field_validator("jwt_secret_key")
    @classmethod
    def warn_insecure_secret(cls, value: str) -> str:
        """Reject obviously weak secrets."""
        weak_values = {
            "your-secret-key",
            "your-secret-key-min-32-chars",
            "CHANGE_ME_IN_PRODUCTION_USE_256BIT_RANDOM_KEY",
        }
        if value in weak_values:
            raise ValueError("JWT secret key must be set to a strong random value")
        return value


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached application settings singleton.

    Using lru_cache ensures the .env file is read exactly once.
    """
    return Settings()
