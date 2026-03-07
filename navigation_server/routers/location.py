"""
Navigation Server — Location API Router.

Endpoints:
  POST /api/v1/nav/location/update        — ingest single GPS ping
  POST /api/v1/nav/location/batch         — ingest batch of offline-buffered pings
  GET  /api/v1/nav/location/nearby        — search nearby drivers/couriers
  GET  /api/v1/nav/location/history       — personal location history
  POST /api/v1/nav/location/share         — start live location sharing
  DELETE /api/v1/nav/location/share/{id}  — stop sharing
  GET  /api/v1/nav/location/share/active  — list active shares

Security enforcement:
  - All endpoints require valid JWT (get_current_user)
  - actor_id is always derived from JWT sub — NEVER from request body
  - Batch endpoint hard-caps at 500 updates per request
  - History endpoint hard-caps date range at 30 days
  - /nearby radius capped at 50 km at service layer
  - /share duration capped at 24h in Pydantic model

Rate limits (enforced by slowapi + Redis; 429 on breach):
  POST /update: 60 req/min per user
  POST /batch:  10 req/min per user
  GET  /nearby: 30 req/min per user
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import JSONResponse

from auth import CurrentUser, get_current_user
from database import get_pool
from exceptions import ValidationError  # type: ignore[import]
from kafka_client import get_kafka_producer
from models.common import APIResponse
from models.location import LocationUpdate, LocationShareRequest
from redis_client import get_redis_client
from services.h3_service import H3Service
from services.location_service import LocationService
from services.presence_service import PresenceService

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/nav/location", tags=["location"])

_h3 = H3Service()


def _get_location_service(request: Request) -> LocationService:
    """
    Construct LocationService from FastAPI app-state dependencies.
    App state is initialised in main.py lifespan and is immutable after startup.
    """
    db = get_pool()
    redis = get_redis_client()
    kafka = get_kafka_producer()
    presence = PresenceService(redis=redis, kafka_producer=kafka, h3_service=_h3)
    return LocationService(
        db_pool=db,
        redis=redis,
        kafka_producer=kafka,
        h3_service=_h3,
        presence_service=presence,
    )


def _get_presence_service() -> PresenceService:
    redis = get_redis_client()
    kafka = get_kafka_producer()
    return PresenceService(redis=redis, kafka_producer=kafka, h3_service=_h3)


# ─────────────────────────────────────────────────────────────────────────────
# POST /update
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/update", response_model=APIResponse, status_code=status.HTTP_200_OK)
async def update_location(
    update: LocationUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    svc: Annotated[LocationService, Depends(_get_location_service)],
) -> JSONResponse:
    """
    Accept a single GPS ping.

    The client MUST call this endpoint every 1–3 seconds while tracking is active.
    actor_type inside LocationUpdate tells the pipeline which GEO set to update.
    actor_id is always the JWT sub — clients cannot impersonate other actors.

    Returns 200 with {h3_index, freshness_ms} on success.
    Returns 200 with {discarded, discard_reason} when GPS quality fails soft validation.
    Returns 422 on hard coordinate rejection (null-island, out-of-range).
    """
    result = await svc.ingest_location(user.user_id, update)
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"success": True, "data": result},
    )


# ─────────────────────────────────────────────────────────────────────────────
# POST /batch
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/batch", response_model=APIResponse, status_code=status.HTTP_200_OK)
async def batch_update(
    updates: list[LocationUpdate],
    user: Annotated[CurrentUser, Depends(get_current_user)],
    svc: Annotated[LocationService, Depends(_get_location_service)],
) -> JSONResponse:
    """
    Batch ingest for offline-buffered GPS updates (e.g. tunnel exit flush).

    Maximum 500 updates per request. Updates are processed in chronological
    order regardless of submission order. Each update runs through the same
    GPS validation pipeline as single /update.

    Returns summary {accepted, discarded, results[]}.
    """
    result = await svc.batch_ingest(user.user_id, updates)
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"success": True, "data": result},
    )


# ─────────────────────────────────────────────────────────────────────────────
# GET /nearby
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/nearby", response_model=APIResponse, status_code=status.HTTP_200_OK)
async def nearby_search(
    lat: float = Query(..., ge=-90.0, le=90.0, description="Search centre latitude"),
    lng: float = Query(..., ge=-180.0, le=180.0, description="Search centre longitude"),
    radius: int = Query(default=3000, ge=100, le=50000, description="Search radius in metres"),
    actor_type: str = Query(default="driver", description="Actor type: driver | vehicle | user"),
    vehicle_class: str | None = Query(default=None, description="Optional vehicle class filter"),
    limit: int = Query(default=20, ge=1, le=100, description="Max results to return"),
    allow_busy: bool = Query(default=False, description="Include busy actors in results"),
    user: CurrentUser = Depends(get_current_user),
    presence: PresenceService = Depends(_get_presence_service),
) -> JSONResponse:
    """
    Find nearby online actors using Redis GEOSEARCH.

    Results are sorted by distance ASC.
    Stale actors (presence key expired but GEO set not yet cleaned) are filtered out.
    Only 'online' actors are returned by default; pass allow_busy=true to include 'busy'.
    """
    if actor_type not in ("driver", "vehicle", "user"):
        raise ValidationError(
            f"Invalid actor_type: {actor_type!r}",
            detail={"valid": ["driver", "vehicle", "user"]},
        )

    actors = await presence.get_nearby_actors(
        lat=lat,
        lng=lng,
        radius_m=float(radius),
        actor_type=actor_type,
        vehicle_class=vehicle_class,
        limit=limit,
        allow_busy=allow_busy,
    )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"success": True, "data": actors},
    )


# ─────────────────────────────────────────────────────────────────────────────
# GET /history
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/history", response_model=APIResponse, status_code=status.HTTP_200_OK)
async def location_history(
    start: datetime = Query(..., description="Range start (ISO 8601)"),
    end: datetime = Query(..., description="Range end (ISO 8601)"),
    limit: int = Query(default=1000, ge=1, le=10000),
    user: CurrentUser = Depends(get_current_user),
    svc: LocationService = Depends(_get_location_service),
) -> JSONResponse:
    """
    Return personal location history from PostGIS nav_location_history.

    Range is capped at 30 days server-side to prevent runaway queries.
    Users can only access their own history — actor_id is taken from JWT.
    """
    # Enforce timezone-aware datetimes
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)

    if end < start:
        raise ValidationError(
            "end must be after start",
            detail={"start": start.isoformat(), "end": end.isoformat()},
        )

    max_range = timedelta(days=30)
    if (end - start) > max_range:
        end = start + max_range

    history = await svc.get_location_history(
        user_id=user.user_id,
        start=start,
        end=end,
        limit=limit,
    )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"success": True, "data": history},
    )


# ─────────────────────────────────────────────────────────────────────────────
# POST /share
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/share", response_model=APIResponse, status_code=status.HTTP_201_CREATED)
async def share_location(
    request: LocationShareRequest,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_pool),
    redis=Depends(get_redis_client),
) -> JSONResponse:
    """
    Start a live location sharing session.

    Creates a row in nav_location_shares with a unique share_id and expiry.
    Recipients listed in recipient_user_ids will see updates via the share_id.
    duration_minutes is capped at 1440 (24h) by the Pydantic model.
    """
    share_id = uuid.uuid4()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=request.duration_minutes)

    await db.execute_query(
        """
        INSERT INTO nav_location_shares (
            id, sharer_id, shared_with,
            is_active, expires_at, created_at
        ) VALUES ($1, $2, $3, true, $4, now())
        """,
        share_id,
        str(user.user_id),
        [str(uid) for uid in request.recipient_user_ids],
        expires_at,
    )

    # Cache share metadata in Redis for fast lookup during live share updates
    share_data = {
        "share_id": str(share_id),
        "sharer_id": str(user.user_id),
        "shared_with": [str(uid) for uid in request.recipient_user_ids],
        "expires_at": expires_at.isoformat(),
    }
    await redis.set_json(
        f"share:{share_id}",
        share_data,
        ttl=request.duration_minutes * 60,
    )

    logger.info(
        "location.share_started",
        share_id=str(share_id),
        user_id=str(user.user_id),
        duration_minutes=request.duration_minutes,
        recipients=len(request.recipient_user_ids),
    )

    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content={
            "success": True,
            "data": {
                "share_id": str(share_id),
                "expires_at": expires_at.isoformat(),
                "recipient_count": len(request.recipient_user_ids),
            },
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# DELETE /share/{share_id}
# ─────────────────────────────────────────────────────────────────────────────

@router.delete(
    "/share/{share_id}",
    response_model=APIResponse,
    status_code=status.HTTP_200_OK,
)
async def stop_sharing(
    share_id: str,
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_pool),
    redis=Depends(get_redis_client),
) -> JSONResponse:
    """
    Stop an active location share session.

    Only the share owner can stop it. Sets is_active=false and removes Redis cache key.
    Returns 404 if share_id not found or already inactive.
    """
    try:
        share_uuid = uuid.UUID(share_id)
    except ValueError:
        raise ValidationError("Invalid share_id format", detail={"share_id": share_id})

    result = await db.fetch_one(
        """
        UPDATE nav_location_shares
           SET is_active = false, updated_at = now()
         WHERE id = $1
           AND sharer_id = $2
           AND is_active = true
        RETURNING id
        """,
        share_uuid,
        str(user.user_id),
    )

    if result is None:
        from exceptions import NotFoundError
        raise NotFoundError(
            f"Active share {share_id} not found or not owned by caller",
            detail={"share_id": share_id},
        )

    await redis.delete(f"share:{share_id}")

    logger.info("location.share_stopped", share_id=share_id, user_id=str(user.user_id))
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"success": True, "data": {"share_id": share_id, "stopped": True}},
    )


# ─────────────────────────────────────────────────────────────────────────────
# GET /share/active
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/share/active",
    response_model=APIResponse,
    status_code=status.HTTP_200_OK,
)
async def active_shares(
    user: CurrentUser = Depends(get_current_user),
    db=Depends(get_pool),
) -> JSONResponse:
    """
    Return all active location shares initiated by the current user.
    Auto-expired (expires_at <= now()) shares are excluded.
    """
    rows = await db.fetch_all(
        """
        SELECT
            id,
            sharer_id,
            shared_with,
            is_active,
            expires_at,
            created_at
        FROM nav_location_shares
        WHERE sharer_id = $1
          AND is_active = true
          AND expires_at > now()
        ORDER BY created_at DESC
        """,
        str(user.user_id),
    )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"success": True, "data": [dict(r) for r in rows]},
    )
