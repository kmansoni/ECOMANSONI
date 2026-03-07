"""
Navigation Server — Surge Pricing API Router.

Endpoints:
  GET /api/v1/nav/surge          — surge multiplier for a specific location
  GET /api/v1/nav/surge/map      — surge heatmap for bounding box
  GET /api/v1/nav/surge/zones    — all active surge zones for a city

Security:
  - All endpoints JWT-authenticated to prevent anonymous scraping.
  - /map and /zones: max bbox 2° × 2° to prevent full-city dump abuse.
  - Multiplier response includes effective_until so client invalidates cache
    on expiry without polling.
  - No surge calculation inputs accepted from client; all computed server-side.

Rate limits (enforced at API gateway):
  GET / (by location): 300 req/min per user (called on picker screen)
  GET /map:            60 req/min per user
  GET /zones:          30 req/min per user — cached 30s
"""
from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status

from auth import CurrentUser, get_current_user
from database import get_pool
from kafka_client import get_kafka_producer
from redis_client import get_redis_client
from services.h3_service import H3Service
from services.presence_service import PresenceService
from services.risk_service import RiskService
from services.surge_service import SurgeService

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/nav/surge", tags=["surge"])

_h3 = H3Service()

MAX_BBOX_DEGREES = 2.0


def _get_surge_service() -> SurgeService:
    pool = get_pool()
    redis = get_redis_client()
    kafka = get_kafka_producer()
    presence = PresenceService(redis=redis, kafka_producer=kafka, h3_service=_h3)
    risk = RiskService(db_pool=pool, redis=redis, kafka=kafka, h3_service=_h3)
    return SurgeService(
        db_pool=pool,
        redis=redis,
        kafka=kafka,
        h3_service=_h3,
        presence_service=presence,
        risk_service=risk,
    )


# ─────────────────────────────────────────────────────────────────────────────

@router.get("/", summary="Surge multiplier for a specific location")
async def get_surge(
    lat: float = Query(..., ge=-90.0, le=90.0),
    lng: float = Query(..., ge=-180.0, le=180.0),
    _user: CurrentUser = Depends(get_current_user),
    svc: SurgeService = Depends(_get_surge_service),
) -> dict:
    """
    Returns the current surge multiplier for the location.
    Response includes effective_until for client-side cache expiry management.
    """
    result = await svc.get_surge_for_location(lat=lat, lng=lng)
    return {
        "success": True,
        **result,
    }


@router.get("/map", summary="Surge heatmap for bounding box")
async def surge_map(
    min_lat: float = Query(..., ge=-90.0, le=90.0),
    min_lng: float = Query(..., ge=-180.0, le=180.0),
    max_lat: float = Query(..., ge=-90.0, le=90.0),
    max_lng: float = Query(..., ge=-180.0, le=180.0),
    _user: CurrentUser = Depends(get_current_user),
    svc: SurgeService = Depends(_get_surge_service),
) -> dict:
    """
    Returns surge heatmap data for a bounding box.
    Each zone entry includes h3_cell, multiplier, and boundary polygon for map rendering.
    Max bounding box: 2° × 2°.
    """
    if max_lat - min_lat > MAX_BBOX_DEGREES or max_lng - min_lng > MAX_BBOX_DEGREES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Bounding box too large. Max {MAX_BBOX_DEGREES}° per side.",
        )
    if min_lat >= max_lat or min_lng >= max_lng:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="min_lat must be < max_lat and min_lng < max_lng",
        )

    zones = await svc.get_surge_map(bbox={
        "min_lat": min_lat,
        "min_lng": min_lng,
        "max_lat": max_lat,
        "max_lng": max_lng,
    })
    return {
        "success": True,
        "count": len(zones),
        "zones": zones,
    }


@router.get("/zones", summary="All active surge zones for a city")
async def surge_zones(
    city_id: str = Query("default", max_length=64),
    _user: CurrentUser = Depends(get_current_user),
    svc: SurgeService = Depends(_get_surge_service),
) -> dict:
    """
    Returns all active surge zones with multiplier > 1.0.
    """
    zones = await svc.get_surge_zones(city_id=city_id)
    return {
        "success": True,
        "city_id": city_id,
        "count": len(zones),
        "zones": zones,
    }
