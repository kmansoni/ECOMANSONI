"""
Navigation Server — Health & Readiness Endpoints

GET /health         — liveness: is the process alive?
GET /health/ready   — readiness: can handle traffic? (checks DB, Redis, Valhalla, Photon)
"""
from __future__ import annotations

import asyncio
import time

import httpx
import structlog
from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse

from config import get_settings
from database import get_pool
from redis_client import get_redis_client

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["Health"])


@router.get("/health", include_in_schema=False)
async def liveness() -> JSONResponse:
    """Kubernetes liveness probe — returns 200 if process is alive."""
    return JSONResponse({"status": "ok"})


@router.get("/health/ready")
async def readiness(request: Request) -> JSONResponse:
    """
    Kubernetes readiness probe.
    Checks all downstream dependencies concurrently with tight timeouts.
    Returns 200 if all checks pass; 503 with details if any fail.
    """
    settings = get_settings()
    http_client: httpx.AsyncClient = request.app.state.http_client

    checks = await asyncio.gather(
        _check_db(),
        _check_redis(),
        _check_valhalla(http_client, str(settings.VALHALLA_URL)),
        _check_photon(http_client, str(settings.PHOTON_URL)),
        return_exceptions=True,
    )

    names = ["database", "redis", "valhalla", "photon"]
    results = {}
    all_ok = True

    for name, result in zip(names, checks):
        if isinstance(result, Exception):
            results[name] = {"status": "fail", "error": str(result)}
            all_ok = False
        else:
            results[name] = result

    http_status = status.HTTP_200_OK if all_ok else status.HTTP_503_SERVICE_UNAVAILABLE
    return JSONResponse({"status": "ok" if all_ok else "degraded", "checks": results},
                        status_code=http_status)


# ── Individual checks ─────────────────────────────────────────────────────────

async def _check_db() -> dict:
    t0 = time.monotonic()
    try:
        pool = get_pool()
        async with pool.acquire(timeout=3.0) as conn:
            await conn.fetchval("SELECT 1")
        return {"status": "ok", "latency_ms": round((time.monotonic() - t0) * 1000, 1)}
    except Exception as exc:
        return {"status": "fail", "error": str(exc)}


async def _check_redis() -> dict:
    t0 = time.monotonic()
    try:
        r = get_redis_client()
        await r.ping()
        return {"status": "ok", "latency_ms": round((time.monotonic() - t0) * 1000, 1)}
    except Exception as exc:
        return {"status": "fail", "error": str(exc)}


async def _check_valhalla(client: httpx.AsyncClient, base_url: str) -> dict:
    t0 = time.monotonic()
    try:
        resp = await client.get(f"{base_url.rstrip('/')}/status", timeout=3.0)
        resp.raise_for_status()
        return {"status": "ok", "latency_ms": round((time.monotonic() - t0) * 1000, 1)}
    except Exception as exc:
        return {"status": "fail", "error": str(exc)}


async def _check_photon(client: httpx.AsyncClient, base_url: str) -> dict:
    t0 = time.monotonic()
    try:
        resp = await client.get(
            f"{base_url.rstrip('/')}/api",
            params={"q": "test", "limit": 1},
            timeout=3.0,
        )
        resp.raise_for_status()
        return {"status": "ok", "latency_ms": round((time.monotonic() - t0) * 1000, 1)}
    except Exception as exc:
        return {"status": "fail", "error": str(exc)}
