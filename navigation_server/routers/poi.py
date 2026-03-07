"""
Navigation Server — POI Router

GET  /api/v1/nav/poi/nearby?lat=&lng=&radius=&category=&limit=
GET  /api/v1/nav/poi/search?q=&lat=&lng=
GET  /api/v1/nav/poi/{poi_id}
POST /api/v1/nav/poi          — create (authenticated)
PUT  /api/v1/nav/poi/{poi_id} — update (authenticated)
"""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status

from auth import CurrentUser, get_current_user
from models.common import APIResponse
from models.poi import POI, POICreateRequest, POIUpdateRequest
from services.poi_service import POIService

router = APIRouter(prefix="/api/v1/nav/poi", tags=["POI"])


def _get_poi_service(request: Request) -> POIService:
    return request.app.state.poi_service


@router.get(
    "/nearby",
    response_model=APIResponse[list[POI]],
    summary="Find POIs within radius of a location",
)
async def nearby_pois(
    svc: Annotated[POIService, Depends(_get_poi_service)],
    user: Annotated[CurrentUser, Depends(get_current_user)],
    lat: float = Query(..., ge=-90.0, le=90.0),
    lng: float = Query(..., ge=-180.0, le=180.0),
    radius: int = Query(default=1000, ge=1, le=50000, alias="radius"),
    category: str | None = Query(default=None),
    q: str | None = Query(default=None, max_length=256),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> APIResponse[list[POI]]:
    trace_id = str(uuid.uuid4())
    results = await svc.search_nearby(
        lat=lat, lng=lng, radius_m=radius,
        category=category, query=q, limit=limit, offset=offset,
    )
    return APIResponse(data=results, trace_id=trace_id)


@router.get(
    "/search",
    response_model=APIResponse[list[POI]],
    summary="Full-text search for POIs by name",
)
async def search_pois(
    svc: Annotated[POIService, Depends(_get_poi_service)],
    user: Annotated[CurrentUser, Depends(get_current_user)],
    q: str = Query(..., min_length=1, max_length=256),
    lat: float | None = Query(default=None, ge=-90.0, le=90.0),
    lng: float | None = Query(default=None, ge=-180.0, le=180.0),
    limit: int = Query(default=20, ge=1, le=100),
) -> APIResponse[list[POI]]:
    trace_id = str(uuid.uuid4())
    results = await svc.search_by_text(query=q, lat=lat, lng=lng, limit=limit)
    return APIResponse(data=results, trace_id=trace_id)


@router.get(
    "/{poi_id}",
    response_model=APIResponse[POI],
    summary="Get a single POI by ID",
)
async def get_poi(
    poi_id: str,
    svc: Annotated[POIService, Depends(_get_poi_service)],
    user: Annotated[CurrentUser, Depends(get_current_user)],
) -> APIResponse[POI]:
    trace_id = str(uuid.uuid4())
    result = await svc.get_by_id(poi_id)
    return APIResponse(data=result, trace_id=trace_id)


@router.post(
    "",
    response_model=APIResponse[POI],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new POI (authenticated users)",
)
async def create_poi(
    body: POICreateRequest,
    svc: Annotated[POIService, Depends(_get_poi_service)],
    user: Annotated[CurrentUser, Depends(get_current_user)],
) -> APIResponse[POI]:
    trace_id = str(uuid.uuid4())
    result = await svc.create(body, user_id=user.user_id)
    return APIResponse(data=result, trace_id=trace_id)


@router.put(
    "/{poi_id}",
    response_model=APIResponse[POI],
    summary="Update an existing POI (authenticated users)",
)
async def update_poi(
    poi_id: str,
    body: POIUpdateRequest,
    svc: Annotated[POIService, Depends(_get_poi_service)],
    user: Annotated[CurrentUser, Depends(get_current_user)],
) -> APIResponse[POI]:
    trace_id = str(uuid.uuid4())
    result = await svc.update(poi_id, body, user_id=user.user_id)
    return APIResponse(data=result, trace_id=trace_id)
