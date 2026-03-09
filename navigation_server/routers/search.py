"""
Navigation Server — Unified Search Router

GET  /api/v1/nav/search?q=&lat=&lng=         — unified search
GET  /api/v1/nav/search/history              — user search history
POST /api/v1/nav/search/history              — save to history
GET  /api/v1/nav/saved-places               — saved places
POST /api/v1/nav/saved-places               — save a place
DELETE /api/v1/nav/saved-places/{place_id}  — delete saved place
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field

from auth import CurrentUser, get_current_user
from database import fetch_all, fetch_one, execute_query
from exceptions import ValidationError
from models.common import APIResponse, GeoJSONPoint
from models.geocoding import AutocompleteResult
from models.poi import POI
from services.geocoding_service import GeocodingService
from services.poi_service import POIService

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/nav", tags=["Search"])


def _get_geocoding_service(request: Request) -> GeocodingService:
    return request.app.state.geocoding_service


def _get_poi_service(request: Request) -> POIService:
    return request.app.state.poi_service


# ── Request/response models for this router ───────────────────────────────────

class UnifiedSearchResult(BaseModel):
    type: str  # geocode | poi | saved_place | recent
    label: str
    location: GeoJSONPoint | None = None
    poi: POI | None = None
    address: str | None = None
    icon: str | None = None
    source_id: str | None = None


class SearchHistoryItem(BaseModel):
    id: str
    place_name: str
    place_lat: float | None = None
    place_lng: float | None = None
    searched_at: datetime


class SaveHistoryRequest(BaseModel):
    place_name: str = Field(..., min_length=1, max_length=256)
    place_lat: float | None = Field(default=None, ge=-90.0, le=90.0)
    place_lng: float | None = Field(default=None, ge=-180.0, le=180.0)


class SavedPlace(BaseModel):
    id: str
    name: str
    address: str | None = None
    lat: float
    lng: float
    icon: str | None = None
    created_at: datetime


class SavePlaceRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    address: str | None = Field(default=None, max_length=512)
    lat: float = Field(..., ge=-90.0, le=90.0)
    lng: float = Field(..., ge=-180.0, le=180.0)
    icon: str | None = Field(default=None, max_length=32)


# ── Unified search ────────────────────────────────────────────────────────────

@router.get(
    "/search",
    response_model=APIResponse[list[UnifiedSearchResult]],
    summary="Unified search: geocoding + POI + saved places + history",
)
async def unified_search(
    geo_svc: Annotated[GeocodingService, Depends(_get_geocoding_service)],
    poi_svc: Annotated[POIService, Depends(_get_poi_service)],
    user: Annotated[CurrentUser, Depends(get_current_user)],
    q: str = Query(..., min_length=1, max_length=512),
    lat: float | None = Query(default=None, ge=-90.0, le=90.0),
    lng: float | None = Query(default=None, ge=-180.0, le=180.0),
    limit: int = Query(default=10, ge=1, le=30),
) -> APIResponse[list[UnifiedSearchResult]]:
    """
    Merges results from:
    1. Photon geocoder
    2. PostGIS POI full-text search
    3. User saved places (prefix match)
    4. User search history (prefix match)
    Deduplicates by label and returns ranked list.
    """
    trace_id = str(uuid.uuid4())
    results: list[UnifiedSearchResult] = []
    sanitized_q = q.strip()
    if len(sanitized_q) > 128:
        raise ValidationError("Search query too long", detail={"max_length": 128})

    # Escape wildcard metacharacters to keep user input as a literal prefix.
    ilike_prefix = (
        sanitized_q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
    )

    # Saved places
    saved_rows = await fetch_all(
        """
        SELECT id::text, name, address,
               ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
        FROM nav_saved_places
        WHERE user_id = $1 AND name ILIKE $2 ESCAPE '\\'
        ORDER BY created_at DESC LIMIT 3
        """,
        user.user_id, ilike_prefix,
    )
    for row in saved_rows:
        results.append(UnifiedSearchResult(
            type="saved_place",
            label=row["name"],
            location=GeoJSONPoint(coordinates=[float(row["lng"]), float(row["lat"])]),
            address=row.get("address"),
            icon="bookmark",
            source_id=row["id"],
        ))

    # Recent searches
    recent_rows = await fetch_all(
        """
        SELECT DISTINCT ON (place_name) id::text, place_name, place_lat, place_lng
        FROM nav_search_history
        WHERE user_id = $1 AND place_name ILIKE $2 ESCAPE '\\'
        ORDER BY place_name, searched_at DESC LIMIT 3
        """,
        user.user_id, ilike_prefix,
    )
    for row in recent_rows:
        results.append(UnifiedSearchResult(
            type="recent",
            label=row["place_name"],
            location=(
                GeoJSONPoint(coordinates=[float(row["place_lng"]), float(row["place_lat"])])
                if row["place_lat"] and row["place_lng"]
                else None
            ),
            icon="history",
        ))

    # POI full-text
    pois = await poi_svc.search_by_text(query=sanitized_q, lat=lat, lng=lng, limit=5)
    for poi in pois:
        results.append(UnifiedSearchResult(
            type="poi",
            label=poi.name,
            location=poi.location,
            poi=poi,
            icon=poi.category,
            source_id=poi.id,
        ))

    # Geocoding
    geo_results = await geo_svc.forward(query=sanitized_q, lat=lat, lng=lng, limit=5)
    for gr in geo_results:
        results.append(UnifiedSearchResult(
            type="geocode",
            label=gr.label,
            location=gr.location,
            address=gr.address.city or gr.address.street,
            icon=geo_svc._category_icon(gr.type),
        ))

    # Deduplicate
    seen: set[str] = set()
    deduped: list[UnifiedSearchResult] = []
    for r in results:
        key = r.label.lower()
        if key not in seen:
            seen.add(key)
            deduped.append(r)

    return APIResponse(data=deduped[:limit], trace_id=trace_id)


# ── Search history ────────────────────────────────────────────────────────────

@router.get(
    "/search/history",
    response_model=APIResponse[list[SearchHistoryItem]],
    summary="Get user's recent search history",
)
async def get_search_history(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    limit: int = Query(default=20, ge=1, le=100),
) -> APIResponse[list[SearchHistoryItem]]:
    rows = await fetch_all(
        """
        SELECT id::text, place_name, place_lat, place_lng, searched_at
        FROM nav_search_history
        WHERE user_id = $1
        ORDER BY searched_at DESC LIMIT $2
        """,
        user.user_id, limit,
    )
    items = [
        SearchHistoryItem(
            id=row["id"],
            place_name=row["place_name"],
            place_lat=float(row["place_lat"]) if row["place_lat"] else None,
            place_lng=float(row["place_lng"]) if row["place_lng"] else None,
            searched_at=row["searched_at"],
        )
        for row in rows
    ]
    return APIResponse(data=items)


@router.post(
    "/search/history",
    response_model=APIResponse[dict],
    status_code=status.HTTP_201_CREATED,
    summary="Save a search to history",
)
async def save_search_history(
    body: SaveHistoryRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
) -> APIResponse[dict]:
    row_id = uuid.uuid4()
    await execute_query(
        """
        INSERT INTO nav_search_history (id, user_id, place_name, place_lat, place_lng, searched_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        """,
        row_id, user.user_id, body.place_name, body.place_lat, body.place_lng,
        datetime.now(timezone.utc),
    )
    return APIResponse(data={"id": str(row_id)})


# ── Saved places ──────────────────────────────────────────────────────────────

@router.get(
    "/saved-places",
    response_model=APIResponse[list[SavedPlace]],
    summary="Get user's saved places",
)
async def get_saved_places(
    user: Annotated[CurrentUser, Depends(get_current_user)],
    limit: int = Query(default=50, ge=1, le=200),
) -> APIResponse[list[SavedPlace]]:
    rows = await fetch_all(
        """
        SELECT id::text, name, address,
               ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng,
               icon, created_at
        FROM nav_saved_places
        WHERE user_id = $1
        ORDER BY created_at DESC LIMIT $2
        """,
        user.user_id, limit,
    )
    places = [
        SavedPlace(
            id=row["id"],
            name=row["name"],
            address=row.get("address"),
            lat=float(row["lat"]),
            lng=float(row["lng"]),
            icon=row.get("icon"),
            created_at=row["created_at"],
        )
        for row in rows
    ]
    return APIResponse(data=places)


@router.post(
    "/saved-places",
    response_model=APIResponse[SavedPlace],
    status_code=status.HTTP_201_CREATED,
    summary="Save a place to user's collection",
)
async def create_saved_place(
    body: SavePlaceRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
) -> APIResponse[SavedPlace]:
    place_id = uuid.uuid4()
    now = datetime.now(timezone.utc)
    await execute_query(
        """
        INSERT INTO nav_saved_places (id, user_id, name, address, location, icon, created_at)
        VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($6, $5), 4326)::geography, $7, $8)
        """,
        place_id, user.user_id, body.name, body.address,
        body.lat, body.lng, body.icon, now,
    )
    return APIResponse(data=SavedPlace(
        id=str(place_id),
        name=body.name,
        address=body.address,
        lat=body.lat,
        lng=body.lng,
        icon=body.icon,
        created_at=now,
    ))


@router.delete(
    "/saved-places/{place_id}",
    response_model=APIResponse[dict],
    summary="Delete a saved place",
)
async def delete_saved_place(
    place_id: str,
    user: Annotated[CurrentUser, Depends(get_current_user)],
) -> APIResponse[dict]:
    result = await execute_query(
        "DELETE FROM nav_saved_places WHERE id = $1 AND user_id = $2",
        uuid.UUID(place_id), user.user_id,
    )
    # asyncpg returns "DELETE N" — check rows affected
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Saved place not found")
    return APIResponse(data={"deleted": True})
