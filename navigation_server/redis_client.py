"""
Navigation Server — Redis Async Client
Singleton pattern; hiredis parser for throughput.
Geo commands, JSON helpers, pub/sub publish.
"""
from __future__ import annotations

from typing import Any, AsyncGenerator

import orjson
import structlog
from redis.asyncio import Redis, ConnectionPool
from redis.asyncio.client import PubSub
from redis.exceptions import RedisError

from config import get_settings

logger = structlog.get_logger(__name__)

_redis: Redis | None = None


async def init_redis() -> None:
    global _redis
    settings = get_settings()
    pool = ConnectionPool.from_url(
        settings.REDIS_URL,
        max_connections=settings.REDIS_POOL_MAX_CONNECTIONS,
        socket_timeout=settings.REDIS_SOCKET_TIMEOUT,
        socket_connect_timeout=settings.REDIS_SOCKET_CONNECT_TIMEOUT,
        decode_responses=False,  # we handle (de)serialisation ourselves
    )
    _redis = Redis(connection_pool=pool)
    # Verify connectivity
    await _redis.ping()
    logger.info("redis.connected", url=settings.REDIS_URL)


async def close_redis() -> None:
    global _redis
    if _redis is not None:
        await _redis.aclose()
        logger.info("redis.closed")
        _redis = None


def get_redis_client() -> Redis:
    if _redis is None:
        raise RuntimeError("Redis client not initialised. Call init_redis() first.")
    return _redis


# ── FastAPI dependency ────────────────────────────────────────────────────────

async def get_redis() -> AsyncGenerator[Redis, None]:
    yield get_redis_client()


# ── Geo helpers ───────────────────────────────────────────────────────────────

async def geo_add(
    key: str,
    longitude: float,
    latitude: float,
    member: str,
    *,
    redis: Redis | None = None,
) -> int:
    """Add/update a geo member. Returns number of NEW members added."""
    r = redis or get_redis_client()
    return await r.geoadd(key, [longitude, latitude, member])


async def geo_search(
    key: str,
    longitude: float,
    latitude: float,
    radius_m: float,
    *,
    count: int = 50,
    sort: str = "ASC",
    with_coord: bool = True,
    with_dist: bool = True,
    redis: Redis | None = None,
) -> list[dict]:
    """
    GEOSEARCH around a point, returns list of
    {"member": str, "dist_m": float, "lon": float, "lat": float}.
    """
    r = redis or get_redis_client()
    raw = await r.geosearch(
        key,
        longitude=longitude,
        latitude=latitude,
        radius=radius_m,
        unit="m",
        sort=sort,
        count=count,
        withcoord=with_coord,
        withdist=with_dist,
    )
    results: list[dict] = []
    for item in raw:
        # item structure depends on withcoord/withdist flags
        # redis-py returns: (member, dist, (lon, lat)) when both flags set
        if with_coord and with_dist:
            member, dist, (lon, lat) = item
            results.append({
                "member": member.decode() if isinstance(member, bytes) else member,
                "dist_m": float(dist),
                "lon": float(lon),
                "lat": float(lat),
            })
        elif with_dist:
            member, dist = item
            results.append({
                "member": member.decode() if isinstance(member, bytes) else member,
                "dist_m": float(dist),
            })
        else:
            member = item
            results.append({
                "member": member.decode() if isinstance(member, bytes) else member,
            })
    return results


# ── JSON helpers ──────────────────────────────────────────────────────────────

async def set_json(
    key: str,
    value: Any,
    ttl: int | None = None,
    *,
    nx: bool = False,
    redis: Redis | None = None,
) -> bool:
    """
    Serialise value with orjson and SET with optional TTL and NX flag.

    Args:
        key:   Redis key.
        value: Python object — serialised with orjson.
        ttl:   Expiry in seconds (positive integer).
               - Without nx: None or 0 means no expiry (persistent key).
               - With nx=True: REQUIRED to be > 0; raises ValueError otherwise
                 to prevent unbounded key growth from NX-idempotency patterns.
        nx:    If True, only set if key does NOT exist (atomic SET NX EX).
               Returns True if key was set, False if it already existed.
               Requires ttl > 0.
        redis: Optional Redis instance (for testing / DI).

    Returns:
        True if the key was written, False if nx=True and key already existed.

    Raises:
        ValueError: if nx=True and ttl is None or <= 0.
    """
    # Guard first — before serialisation to avoid wasted CPU on invalid calls.
    if nx and (ttl is None or ttl <= 0):
        raise ValueError(
            f"set_json(..., nx=True) requires ttl > 0 to prevent unbounded key growth. "
            f"Got ttl={ttl!r}"
        )
    r = redis or get_redis_client()
    encoded = orjson.dumps(value)
    if nx:
        # SET key value NX EX ttl — atomic; returns None if key already existed.
        result = await r.set(key, encoded, nx=True, ex=ttl)
        return result is not None
    if ttl is not None and ttl > 0:
        await r.setex(key, ttl, encoded)
    else:
        await r.set(key, encoded)
    return True


async def get_json(
    key: str,
    *,
    redis: Redis | None = None,
) -> Any | None:
    """GET and deserialise with orjson. Returns None on cache miss."""
    r = redis or get_redis_client()
    raw = await r.get(key)
    if raw is None:
        return None
    return orjson.loads(raw)


# ── Pub/Sub ───────────────────────────────────────────────────────────────────

async def publish(channel: str, message: Any, *, redis: Redis | None = None) -> int:
    """Publish a JSON-encoded message to a Redis channel."""
    r = redis or get_redis_client()
    return await r.publish(channel, orjson.dumps(message))
