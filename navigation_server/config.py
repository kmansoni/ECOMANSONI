"""
Navigation Server — Configuration
Pydantic-Settings v2; all values sourced from environment / .env file.
No defaults contain secrets; secret fields have no default values.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from pydantic import AnyHttpUrl, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Database ─────────────────────────────────────────────────────────────
    # asyncpg DSN: postgresql+asyncpg://user:pass@host:port/dbname
    DATABASE_URL: str = Field(..., description="asyncpg PostgreSQL DSN")
    DB_POOL_MIN_SIZE: int = Field(default=5, ge=1, le=50)
    DB_POOL_MAX_SIZE: int = Field(default=20, ge=1, le=200)
    DB_POOL_MAX_INACTIVE_CONNECTION_LIFETIME: float = Field(default=300.0)
    DB_COMMAND_TIMEOUT: float = Field(default=10.0, description="Query timeout seconds")

    # ── Redis ─────────────────────────────────────────────────────────────────
    REDIS_URL: str = Field(default="redis://redis:6380/0")
    REDIS_POOL_MAX_CONNECTIONS: int = Field(default=50)
    REDIS_SOCKET_TIMEOUT: float = Field(default=2.0)
    REDIS_SOCKET_CONNECT_TIMEOUT: float = Field(default=2.0)

    # ── Kafka / Redpanda ──────────────────────────────────────────────────────
    KAFKA_BOOTSTRAP_SERVERS: str = Field(default="redpanda:9092")
    KAFKA_PRODUCER_LINGER_MS: int = Field(default=5)
    KAFKA_PRODUCER_BATCH_SIZE: int = Field(default=65536)
    KAFKA_PRODUCER_COMPRESSION_TYPE: str = Field(default="lz4")

    # ── Valhalla ──────────────────────────────────────────────────────────────
    VALHALLA_URL: AnyHttpUrl = Field(default="http://valhalla:8002")
    VALHALLA_TIMEOUT: float = Field(default=15.0)
    VALHALLA_MAX_RETRIES: int = Field(default=3)

    # ── Photon (geocoding) ────────────────────────────────────────────────────
    PHOTON_URL: AnyHttpUrl = Field(default="http://photon:2322")
    PHOTON_TIMEOUT: float = Field(default=5.0)

    # ── Martin (vector tiles) ─────────────────────────────────────────────────
    MARTIN_URL: AnyHttpUrl = Field(default="http://martin:3000")

    # ── ClickHouse ────────────────────────────────────────────────────────────
    CLICKHOUSE_URL: str = Field(default="http://clickhouse:8123")
    CLICKHOUSE_USER: str = Field(default="default")
    CLICKHOUSE_PASSWORD: str = Field(default="")
    CLICKHOUSE_DATABASE: str = Field(default="navigation")

    # ── Supabase ──────────────────────────────────────────────────────────────
    SUPABASE_URL: AnyHttpUrl = Field(...)
    SUPABASE_SERVICE_KEY: str = Field(...)  # service-role JWT, never exposed to client

    # ── JWT ───────────────────────────────────────────────────────────────────
    JWT_SECRET: str = Field(...)
    JWT_ALGORITHM: str = Field(default="HS256")
    JWT_AUDIENCE: str = Field(default="authenticated")
    JWT_LEEWAY_SECONDS: int = Field(default=30)

    # ── API keys (SDK auth) ───────────────────────────────────────────────────
    # Comma-separated list of valid SDK API keys stored as env var
    SDK_API_KEYS: str = Field(default="")

    @property
    def sdk_api_keys_set(self) -> set[str]:
        return {k.strip() for k in self.SDK_API_KEYS.split(",") if k.strip()}

    # ── Application ───────────────────────────────────────────────────────────
    LOG_LEVEL: str = Field(default="INFO")
    ENVIRONMENT: str = Field(default="production")
    DEBUG: bool = Field(default=False)

    CORS_ORIGINS: str = Field(
        default="https://ecomansoni.app,https://api.ecomansoni.app",
        description="Comma-separated allowed CORS origins",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    # ── Pricing constants (fuel estimation) ───────────────────────────────────
    FUEL_PRICE_RUB_PER_LITER: float = Field(default=55.0)
    FUEL_CONSUMPTION_L_PER_100KM: float = Field(default=10.0)
    CO2_GRAMS_PER_LITER_PETROL: float = Field(default=2392.0)

    # ── Caching TTLs (seconds) ────────────────────────────────────────────────
    GEOCODE_CACHE_TTL: int = Field(default=3600)
    POI_CACHE_TTL: int = Field(default=300)
    ROUTE_CACHE_TTL: int = Field(default=60)

    @field_validator("LOG_LEVEL")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        allowed = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        upper = v.upper()
        if upper not in allowed:
            raise ValueError(f"LOG_LEVEL must be one of {allowed}")
        return upper


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
