"""
Navigation Server — Traffic API Router.

Endpoints:
  GET /api/v1/nav/traffic/area    — traffic in bounding box
  GET /api/v1/nav/traffic/route   — traffic along a route
  GET /api/v1/nav/traffic/summary — city-wide congestion summary

Security:
  - All endpoints require valid JWT (read-only data, but auth required to prevent
    anonymous scraping of real-time movement data).
  - Bounding-box dimensions validated: max 1°×1° to prevent mega-range scans.
  - route polyline limited to 500 points to prevent server-side abuse.

Rate limits (enforced at API gateway):
  GET /area:    120 req/min per user
  GET /route:   60 req/min per user
  GET /summary: 30 req/min — cached 30s server-side
"""
from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from auth import CurrentUser, get_current_user
from database import get_pool
from kafka_client import get_kafka_producer
from redis_client import get_redis_client
from services.h3_service import H3Service
from services.traffic_service import TrafficService

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/nav/traffic", tags=["traffic"])

_h3 = H3Service()

MAX_BBOX_DEGREES = 1.0   # prevent mega-range scans
MAX_ROUTE_POINTS = 500


def _get_traffic_service() -> TrafficService:
    return TrafficService(
        db_pool=get_pool(),
        redis=get_redis_client(),
        kafka=get_kafka_producer(),
        h3_service=_h3,
    )


# ─────────────────────────────────────────────────────────────────────────────

@router.get("/area", summary="Traffic segments in bounding box")
async def traffic_area(
    min_lat: float = Query(..., ge=-90.0, le=90.0),
    min_lng: float = Query(..., ge=-180.0, le=180.0),
    max_lat: float = Query(..., ge=-90.0, le=90.0),
    max_lng: float = Query(..., ge=-180.0, le=180.0),
    _user: CurrentUser = Depends(get_current_user),
    svc: TrafficService = Depends(_get_traffic_service),
) -> dict:
    """
    Returns traffic segment data for a bounding box.
    Only segments fresher than 15 minutes are included.
    Max box size: 1° × 1° (≈ 111 km × 111 km at equator).
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

    segments = await svc.get_traffic_for_area(min_lat, min_lng, max_lat, max_lng)
    return {
        "success": True,
        "count": len(segments),
        "segments": segments,
    }


@router.get("/route", summary="Traffic along a route")
async def traffic_route(
    route_id: str | None = Query(None, description="Stored route ID"),
    encoded_polyline: str | None = Query(None, description="Encoded polyline (Google format)"),
    _user: CurrentUser = Depends(get_current_user),
    svc: TrafficService = Depends(_get_traffic_service),
) -> dict:
    """
    Returns traffic colouring data for a route.

    Provide either:
    - route_id: a stored route from nav_routes table (fetched server-side)
    - encoded_polyline: Google Encoded Polyline Algorithm format

    On polyline input: decoded, validated (max 500 points), and matched to segments.
    """
    if route_id is None and encoded_polyline is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide either route_id or encoded_polyline",
        )

    geometry: list[list[float]] = []

    if route_id is not None:
        # Fetch route geometry from DB
        pool = get_pool()
        row = await pool.fetchrow(
            """
            SELECT geometry FROM nav_routes WHERE id = $1
            """,
            route_id,
        )
        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Route {route_id!r} not found",
            )
        # geometry is stored as GeoJSON LineString
        import json as _json
        geo = _json.loads(row["geometry"]) if isinstance(row["geometry"], str) else row["geometry"]
        geometry = geo.get("coordinates", [])
    else:
        # Decode encoded polyline
        geometry = _decode_polyline(encoded_polyline)

    if len(geometry) > MAX_ROUTE_POINTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Route too long: max {MAX_ROUTE_POINTS} points",
        )
    if len(geometry) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Route requires at least 2 coordinate pairs",
        )

    segments = await svc.get_traffic_for_route(geometry)
    return {
        "success": True,
        "count": len(segments),
        "segments": segments,
    }


@router.get("/summary", summary="City-wide traffic summary")
async def traffic_summary(
    city_id: str = Query("default", max_length=64),
    _user: CurrentUser = Depends(get_current_user),
    svc: TrafficService = Depends(_get_traffic_service),
) -> dict:
    """
    Returns city-wide congestion statistics.
    Cached server-side for 30 seconds.
    """
    summary = await svc.get_traffic_summary(city_id=city_id)
    return {
        "success": True,
        "summary": summary,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _decode_polyline(encoded: str) -> list[list[float]]:
    """
    Decode a Google Encoded Polyline string into a list of [lng, lat] pairs.
    Ref: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
    """
    points: list[list[float]] = []
    index = 0
    result_lat = 0
    result_lng = 0
    length = len(encoded)

    while index < length:
        # Latitude
        shift, result = 0, 0
        while True:
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        d_lat = ~(result >> 1) if result & 1 else result >> 1
        result_lat += d_lat

        # Longitude
        shift, result = 0, 0
        while True:
            b = ord(encoded[index]) - 63
            index += 1
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        d_lng = ~(result >> 1) if result & 1 else result >> 1
        result_lng += d_lng

        lat = result_lat / 1e5
        lng = result_lng / 1e5
        # Validate bounds
        if -90 <= lat <= 90 and -180 <= lng <= 180:
            points.append([lng, lat])

    return points
