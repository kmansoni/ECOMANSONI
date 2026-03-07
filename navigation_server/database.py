"""
Navigation Server — Async Database Layer
Uses asyncpg directly (no ORM overhead for hot geo-query paths).
SQLAlchemy async engine is also provided for migrations/ORM tooling.
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

import asyncpg
import structlog
from asyncpg import Connection, Pool
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from config import get_settings

logger = structlog.get_logger(__name__)

# ── Module-level singletons ───────────────────────────────────────────────────
_pool: Pool | None = None
_engine: AsyncEngine | None = None


async def init_db() -> None:
    """Create the asyncpg pool and SQLAlchemy async engine.
    Called once on application startup."""
    global _pool, _engine
    settings = get_settings()

    # asyncpg raw pool — used by fast geo query helpers
    _pool = await asyncpg.create_pool(
        dsn=settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://"),
        min_size=settings.DB_POOL_MIN_SIZE,
        max_size=settings.DB_POOL_MAX_SIZE,
        max_inactive_connection_lifetime=settings.DB_POOL_MAX_INACTIVE_CONNECTION_LIFETIME,
        command_timeout=settings.DB_COMMAND_TIMEOUT,
        server_settings={"application_name": "navigation_server"},
    )

    # SQLAlchemy engine (used for schema introspection, Alembic, optional ORM)
    _engine = create_async_engine(
        settings.DATABASE_URL,
        pool_pre_ping=True,
        pool_size=settings.DB_POOL_MIN_SIZE,
        max_overflow=settings.DB_POOL_MAX_SIZE - settings.DB_POOL_MIN_SIZE,
        echo=settings.DEBUG,
    )

    logger.info("database.pool_ready", min_size=settings.DB_POOL_MIN_SIZE,
                max_size=settings.DB_POOL_MAX_SIZE)


async def close_db() -> None:
    """Gracefully close pool on shutdown."""
    global _pool, _engine
    if _pool is not None:
        await _pool.close()
        logger.info("database.pool_closed")
        _pool = None
    if _engine is not None:
        await _engine.dispose()
        _engine = None


def get_pool() -> Pool:
    """Return the module-level pool; raises RuntimeError if not initialised."""
    if _pool is None:
        raise RuntimeError("Database pool not initialised. Call init_db() first.")
    return _pool


def get_engine() -> AsyncEngine:
    if _engine is None:
        raise RuntimeError("SQLAlchemy engine not initialised. Call init_db() first.")
    return _engine


# ── FastAPI dependency ────────────────────────────────────────────────────────
@asynccontextmanager
async def _acquire(pool: Pool) -> AsyncGenerator[Connection, None]:
    """Acquire a connection from the pool with timeout guard."""
    async with pool.acquire(timeout=10.0) as conn:
        yield conn


async def get_db() -> AsyncGenerator[Connection, None]:
    """
    FastAPI dependency: yields an asyncpg Connection.
    Usage:
        async def endpoint(conn: Connection = Depends(get_db)):
    """
    pool = get_pool()
    async with pool.acquire(timeout=10.0) as conn:
        yield conn


# ── Query helpers ─────────────────────────────────────────────────────────────

async def execute_query(
    query: str,
    *args: Any,
    conn: Connection | None = None,
    timeout: float | None = None,
) -> str:
    """Execute a DML statement. Returns the command tag string."""
    pool = get_pool()
    if conn is not None:
        return await conn.execute(query, *args, timeout=timeout)
    async with pool.acquire(timeout=10.0) as c:
        return await c.execute(query, *args, timeout=timeout)


async def fetch_one(
    query: str,
    *args: Any,
    conn: Connection | None = None,
    timeout: float | None = None,
) -> asyncpg.Record | None:
    """Fetch a single row; returns None if no rows match."""
    pool = get_pool()
    if conn is not None:
        return await conn.fetchrow(query, *args, timeout=timeout)
    async with pool.acquire(timeout=10.0) as c:
        return await c.fetchrow(query, *args, timeout=timeout)


async def fetch_all(
    query: str,
    *args: Any,
    conn: Connection | None = None,
    timeout: float | None = None,
) -> list[asyncpg.Record]:
    """Fetch all rows for a SELECT statement."""
    pool = get_pool()
    if conn is not None:
        return await conn.fetch(query, *args, timeout=timeout)
    async with pool.acquire(timeout=10.0) as c:
        return await c.fetch(query, *args, timeout=timeout)


async def fetch_val(
    query: str,
    *args: Any,
    column: int = 0,
    conn: Connection | None = None,
    timeout: float | None = None,
) -> Any:
    """Fetch a scalar value."""
    pool = get_pool()
    if conn is not None:
        return await conn.fetchval(query, *args, column=column, timeout=timeout)
    async with pool.acquire(timeout=10.0) as c:
        return await c.fetchval(query, *args, column=column, timeout=timeout)
