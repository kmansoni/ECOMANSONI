"""
Navigation Server — Trips API Router.

Endpoints:
  POST   /api/v1/nav/trips/               — create trip
  GET    /api/v1/nav/trips/estimate       — price estimate (no trip created)
  GET    /api/v1/nav/trips/               — list user trips
  GET    /api/v1/nav/trips/{trip_id}      — get single trip
  POST   /api/v1/nav/trips/{trip_id}/cancel   — cancel trip
  POST   /api/v1/nav/trips/{trip_id}/status   — driver status transition
  POST   /api/v1/nav/trips/{trip_id}/rate     — rate completed trip

Security:
  - All endpoints require valid JWT (get_current_user).
  - user_id always sourced from JWT.user_id — never from request body.
  - Trip read access: requester or assigned driver only (enforced in service).
  - Status transitions: driver-only states validated in TripService FSM.

Rate limits:
  POST /: enforced at gateway (5 trips/min per user).
  POST /{id}/rate: idempotent — DB unique constraint blocks double-rating.
"""
from __future__ import annotations

from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import JSONResponse

from auth import CurrentUser, get_current_user
from database import get_pool
from exceptions import NavigationBaseError
from kafka_client import get_kafka_producer
from models.common import APIResponse, LatLng
from models.trips import TripCreateRequest, TripResponse, TripStatusUpdate
from redis_client import get_redis_client
from services.dispatch_service import DispatchService
from services.h3_service import H3Service
from services.presence_service import PresenceService
from services.routing_service import RoutingService
from services.trip_service import TripService

import httpx

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/nav/trips", tags=["trips"])

# Module-level shared singletons (stateless services)
_h3 = H3Service()


def _get_trip_service() -> TripService:
    db = get_pool()
    redis = get_redis_client()
    kafka = get_kafka_producer()
    from config import get_settings
    settings = get_settings()
    http_client = httpx.AsyncClient(timeout=settings.VALHALLA_TIMEOUT)
    routing = RoutingService(valhalla_url=settings.VALHALLA_URL, http_client=http_client)
    presence = PresenceService(redis=redis, kafka_producer=kafka, h3_service=_h3)
    dispatch = DispatchService(
        db_pool=db,
        redis=redis,
        kafka=kafka,
        presence_service=presence,
        routing_service=routing,
        h3_service=_h3,
    )
    return TripService(
        db_pool=db,
        redis=redis,
        kafka=kafka,
        routing_service=routing,
        dispatch_service=dispatch,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/",
    response_model=TripResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create trip",
)
async def create_trip(
    request: TripCreateRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
) -> TripResponse:
    """
    Create a new trip request. Triggers dispatch pipeline asynchronously.

    Idempotent: duplicate requests with the same `idempotency_key` return
    the existing trip without side effects.
    """
    svc = _get_trip_service()
    trip = await svc.create_trip(user_id=user.user_id, request=request)
    logger.info("api.trip_created", trip_id=trip.trip_id, user_id=user.user_id)
    return trip


@router.get(
    "/estimate",
    summary="Price estimate",
)
async def price_estimate(
    pickup_lat: float = Query(..., ge=-90, le=90),
    pickup_lng: float = Query(..., ge=-180, le=180),
    dropoff_lat: float = Query(..., ge=-90, le=90),
    dropoff_lng: float = Query(..., ge=-180, le=180),
    service_type: str = Query("standard"),
    user: Annotated[CurrentUser, Depends(get_current_user)] = None,
) -> JSONResponse:
    """
    Quick price estimate without creating a trip.
    Returns distance, duration, price breakdown, and surge multiplier.
    """
    svc = _get_trip_service()
    pickup = LatLng(lat=pickup_lat, lng=pickup_lng)
    dropoff = LatLng(lat=dropoff_lat, lng=dropoff_lng)
    estimate = await svc.get_price_estimate(
        pickup=pickup, dropoff=dropoff, service_type=service_type
    )
    return JSONResponse(content={"ok": True, "data": estimate})


@router.get(
    "/",
    summary="List user trips",
)
async def list_trips(
    status: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: Annotated[CurrentUser, Depends(get_current_user)] = None,
) -> JSONResponse:
    """
    List trips where the authenticated user is requester or assigned driver.
    Supports optional status filter and pagination.
    """
    svc = _get_trip_service()
    trips = await svc.get_user_trips(
        user_id=user.user_id, status=status, limit=limit, offset=offset
    )
    return JSONResponse(
        content={
            "ok": True,
            "data": [t.model_dump(mode="json") for t in trips],
            "total": len(trips),
        }
    )


@router.get(
    "/{trip_id}",
    response_model=TripResponse,
    summary="Get trip",
)
async def get_trip(
    trip_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)] = None,
) -> TripResponse:
    """
    Get trip by ID.
    Only the requester or the assigned driver can access the trip.
    """
    svc = _get_trip_service()
    return await svc.get_trip(trip_id=trip_id, user_id=user.user_id)


@router.post(
    "/{trip_id}/cancel",
    response_model=TripResponse,
    summary="Cancel trip",
)
async def cancel_trip(
    trip_id: str,
    reason: str | None = Query(default=None, max_length=256),
    user: Annotated[CurrentUser, Depends(get_current_user)] = None,
) -> TripResponse:
    """
    Cancel a trip.

    Free cancel if trip is in requested/searching state.
    Cancellation fee may apply if driver is already assigned/enroute.
    Cannot cancel an in-progress trip.
    """
    svc = _get_trip_service()
    return await svc.cancel_trip(
        trip_id=trip_id, user_id=user.user_id, reason=reason
    )


@router.post(
    "/{trip_id}/status",
    response_model=TripResponse,
    summary="Update trip status (driver transitions)",
)
async def update_status(
    trip_id: str,
    body: TripStatusUpdate,
    user: Annotated[CurrentUser, Depends(get_current_user)] = None,
) -> TripResponse:
    """
    Advance trip FSM state.

    Driver-side transitions (driver_enroute, driver_arrived, in_progress, completed)
    require the JWT to belong to the assigned driver.

    Metadata can carry actual_distance_m, actual_duration_s for final price
    calculation on completion.
    """
    svc = _get_trip_service()
    return await svc.update_trip_status(
        trip_id=trip_id,
        new_status=body.status,
        user_id=user.user_id,
        metadata={"reason": body.reason} if body.reason else {},
    )


@router.post(
    "/{trip_id}/rate",
    summary="Rate completed trip",
)
async def rate_trip(
    trip_id: str,
    rating: int = Query(..., ge=1, le=5),
    comment: str | None = Query(default=None, max_length=512),
    user: Annotated[CurrentUser, Depends(get_current_user)] = None,
) -> JSONResponse:
    """
    Rate a completed trip (1–5 stars).
    Rider rates driver; driver rates rider.
    Each participant can rate only once per trip.
    """
    svc = _get_trip_service()
    result = await svc.rate_trip(
        trip_id=trip_id,
        user_id=user.user_id,
        rating=rating,
        comment=comment,
    )
    return JSONResponse(content={"ok": True, "data": result})
