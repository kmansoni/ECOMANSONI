"""
Navigation Server — Dispatch API Router (driver-facing).

Endpoints:
  GET    /api/v1/nav/dispatch/offers              — pending offers for driver
  POST   /api/v1/nav/dispatch/offers/{id}/respond — accept / reject offer
  POST   /api/v1/nav/dispatch/availability        — set driver online/offline/busy
  GET    /api/v1/nav/dispatch/stats               — driver stats

Security:
  - All endpoints require valid JWT.
  - driver_id always from JWT.user_id — never from request body or URL.
  - respond_to_offer: offer ownership validated in DispatchService
    (SELECT … FOR UPDATE SKIP LOCKED prevents race conditions).
  - availability endpoint only modifies the caller's own record.

Rate limits:
  POST /offers/{id}/respond: 1 active offer at a time per driver (DB constraint).
  POST /availability: 60 changes/hour per driver (gateway-enforced).
"""
from __future__ import annotations

from typing import Annotated, Literal

import structlog
from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from auth import CurrentUser, get_current_user
from database import get_pool
from kafka_client import get_kafka_producer
from redis_client import get_redis_client
from services.dispatch_service import DispatchService
from services.h3_service import H3Service
from services.presence_service import PresenceService
from services.routing_service import RoutingService

import httpx

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/nav/dispatch", tags=["dispatch"])

_h3 = H3Service()


def _get_dispatch_service() -> DispatchService:
    db = get_pool()
    redis = get_redis_client()
    kafka = get_kafka_producer()
    from config import get_settings
    settings = get_settings()
    http_client = httpx.AsyncClient(timeout=settings.VALHALLA_TIMEOUT)
    routing = RoutingService(valhalla_url=settings.VALHALLA_URL, http_client=http_client)
    presence = PresenceService(redis=redis, kafka_producer=kafka, h3_service=_h3)
    return DispatchService(
        db_pool=db,
        redis=redis,
        kafka=kafka,
        presence_service=presence,
        routing_service=routing,
        h3_service=_h3,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Request models
# ─────────────────────────────────────────────────────────────────────────────

class OfferRespondBody(BaseModel):
    accepted: bool
    rejection_reason: str | None = None


class AvailabilityBody(BaseModel):
    availability: Literal["online", "offline", "busy"]


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/offers",
    summary="Get pending offers for driver",
)
async def get_pending_offers(
    user: Annotated[CurrentUser, Depends(get_current_user)] = None,
) -> JSONResponse:
    """
    Return all non-expired pending dispatch offers for the authenticated driver.
    Includes trip details, pickup ETA, and offer expiry time.
    """
    svc = _get_dispatch_service()
    offers = await svc.get_pending_offers(driver_id=user.user_id)
    logger.info("api.dispatch.offers_fetched", driver_id=user.user_id, count=len(offers))
    return JSONResponse(
        content={"ok": True, "data": offers, "total": len(offers)}
    )


@router.post(
    "/offers/{offer_id}/respond",
    summary="Accept or reject a dispatch offer",
)
async def respond_to_offer(
    offer_id: str,
    body: OfferRespondBody,
    user: Annotated[CurrentUser, Depends(get_current_user)] = None,
) -> JSONResponse:
    """
    Accept or reject a dispatch offer.

    On accept:
    - Trip is atomically assigned to the driver (SELECT … FOR UPDATE SKIP LOCKED).
    - All other pending offers for the trip are cancelled.
    - Driver acceptance rate is updated.
    - Kafka event: trip.driver_assigned.

    On reject:
    - Next candidate in cascade queue receives a new offer.
    - Driver acceptance rate is updated (negative).
    - If no more candidates: trip transitions to cancelled/no_drivers.

    Concurrency: this endpoint is safe for parallel calls — exactly one
    driver wins the trip via DB-level locking.
    """
    svc = _get_dispatch_service()
    result = await svc.respond_to_offer(
        driver_id=user.user_id,
        offer_id=offer_id,
        accepted=body.accepted,
        rejection_reason=body.rejection_reason,
    )
    logger.info(
        "api.dispatch.offer_responded",
        offer_id=offer_id,
        driver_id=user.user_id,
        accepted=body.accepted,
    )
    return JSONResponse(content={"ok": True, "data": result})


@router.post(
    "/availability",
    summary="Set driver availability",
)
async def set_availability(
    body: AvailabilityBody,
    user: Annotated[CurrentUser, Depends(get_current_user)] = None,
) -> JSONResponse:
    """
    Set driver availability: online / offline / busy.

    - online: driver is visible for dispatch, will receive offers.
    - busy: driver has an active trip, not available for new offers.
    - offline: driver is off duty; removed from presence geo-index.

    Updates both Redis presence and nav_driver_profiles.is_active.
    Publishes nav.presence.changes Kafka event.
    """
    svc = _get_dispatch_service()
    result = await svc.set_driver_availability(
        driver_id=user.user_id,
        availability=body.availability,
    )
    logger.info(
        "api.dispatch.availability_set",
        driver_id=user.user_id,
        availability=body.availability,
    )
    return JSONResponse(content={"ok": True, "data": result})


@router.get(
    "/stats",
    summary="Driver statistics",
)
async def driver_stats(
    user: Annotated[CurrentUser, Depends(get_current_user)] = None,
) -> JSONResponse:
    """
    Return driver statistics: completed trips count, rating, acceptance rate,
    cancellation rate, vehicle info, and current availability.

    Data is sourced from nav_driver_profiles with a joined aggregate
    over nav_trips — single query, server-side computed.
    """
    svc = _get_dispatch_service()
    stats = await svc.get_driver_stats(driver_id=user.user_id)
    return JSONResponse(content={"ok": True, "data": stats})
