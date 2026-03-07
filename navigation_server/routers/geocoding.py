"""
Navigation Server — Geocoding Router

GET /api/v1/nav/geocode/forward?q=&lat=&lng=&limit=&lang=
GET /api/v1/nav/geocode/reverse?lat=&lng=&lang=&radius_m=
GET /api/v1/nav/geocode/autocomplete?q=&lat=&lng=&limit=
"""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status

from auth import CurrentUser, get_current_user
from models.common import APIResponse
from models.geocoding import AutocompleteResult, GeocodeResult
from services.geocoding_service import GeocodingService

router = APIRouter(prefix="/api/v1/nav/geocode", tags=["Geocoding"])


def _get_geocoding_service(request: Request) -> GeocodingService:
    return request.app.state.geocoding_service


@router.get(
    "/forward",
    response_model=APIResponse[list[GeocodeResult]],
    status_code=status.HTTP_200_OK,
    summary="Forward geocoding — address/place name to coordinates",
)
async def forward_geocode(
    svc: Annotated[GeocodingService, Depends(_get_geocoding_service)],
    user: Annotated[CurrentUser, Depends(get_current_user)],
    q: str = Query(..., min_length=1, max_length=512, description="Search query"),
    lat: float | None = Query(default=None, ge=-90.0, le=90.0),
    lng: float | None = Query(default=None, ge=-180.0, le=180.0),
    limit: int = Query(default=5, ge=1, le=20),
    lang: str = Query(default="default", max_length=10),
) -> APIResponse[list[GeocodeResult]]:
    trace_id = str(uuid.uuid4())
    results = await svc.forward(query=q, lat=lat, lng=lng, limit=limit, lang=lang)
    return APIResponse(data=results, trace_id=trace_id)


@router.get(
    "/reverse",
    response_model=APIResponse[GeocodeResult],
    status_code=status.HTTP_200_OK,
    summary="Reverse geocoding — coordinates to address",
)
async def reverse_geocode(
    svc: Annotated[GeocodingService, Depends(_get_geocoding_service)],
    user: Annotated[CurrentUser, Depends(get_current_user)],
    lat: float = Query(..., ge=-90.0, le=90.0),
    lng: float = Query(..., ge=-180.0, le=180.0),
    lang: str = Query(default="default", max_length=10),
    radius_m: int = Query(default=1000, ge=1, le=50000),
) -> APIResponse[GeocodeResult | None]:
    trace_id = str(uuid.uuid4())
    result = await svc.reverse(lat=lat, lng=lng, lang=lang, radius_m=radius_m)
    return APIResponse(data=result, trace_id=trace_id)


@router.get(
    "/autocomplete",
    response_model=APIResponse[list[AutocompleteResult]],
    status_code=status.HTTP_200_OK,
    summary="Typeahead autocomplete merging geocoder + saved places + history",
)
async def autocomplete(
    svc: Annotated[GeocodingService, Depends(_get_geocoding_service)],
    user: Annotated[CurrentUser, Depends(get_current_user)],
    q: str = Query(..., min_length=1, max_length=256),
    lat: float | None = Query(default=None, ge=-90.0, le=90.0),
    lng: float | None = Query(default=None, ge=-180.0, le=180.0),
    limit: int = Query(default=5, ge=1, le=10),
) -> APIResponse[list[AutocompleteResult]]:
    trace_id = str(uuid.uuid4())
    results = await svc.autocomplete(
        query=q, lat=lat, lng=lng, limit=limit, user_id=user.user_id
    )
    return APIResponse(data=results, trace_id=trace_id)
