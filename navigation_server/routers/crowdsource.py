"""
Navigation Server — Crowdsource Reports API Router.

Endpoints:
  POST /api/v1/nav/reports/              — create report
  POST /api/v1/nav/reports/{id}/vote     — vote on report
  GET  /api/v1/nav/reports/nearby        — find reports near a point
  GET  /api/v1/nav/reports/heatmap       — aggregate heatmap for bbox
  GET  /api/v1/nav/reports/{id}          — get single report

Security:
  - POST endpoints require JWT (get_current_user)
  - GET /nearby and GET /heatmap are intentionally unauthenticated for
    map display in guest/preview mode; no sensitive data is exposed
  - GET /{id} is unauthenticated
  - user_id always comes from JWT, never from the request body

Rate limits:
  POST /: 30 reports/hour per user (enforce at nginx/gateway, not here)
  POST /{id}/vote: 1 vote per (user, report) enforced by DB unique constraint
"""
from __future__ import annotations

import uuid
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from auth import CurrentUser, get_current_user
from database import get_pool
from exceptions import ValidationError  # type: ignore[import]
from kafka_client import get_kafka_producer
from models.common import APIResponse, BBox
from redis_client import get_redis_client
from services.crowdsource_service import CrowdsourceService, VALID_REPORT_TYPES
from services.h3_service import H3Service

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/nav/reports", tags=["crowdsource"])

_h3 = H3Service()


def _get_crowdsource_service() -> CrowdsourceService:
    return CrowdsourceService(
        db_pool=get_pool(),
        redis=get_redis_client(),
        kafka_producer=get_kafka_producer(),
        h3_service=_h3,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Request models (local — not in models/ since they're router-specific)
# ─────────────────────────────────────────────────────────────────────────────

class ReportCreateRequest(BaseModel):
    report_type: str = Field(..., description="Type: accident|police|camera|road_work|hazard|closure|pothole")
    lat: float = Field(..., ge=-90.0, le=90.0)
    lng: float = Field(..., ge=-180.0, le=180.0)
    description: str | None = Field(default=None, max_length=500)
    extra_data: dict | None = Field(default=None, description="Optional structured metadata")


class ReportVoteRequest(BaseModel):
    vote_type: str = Field(..., description="upvote | downvote")


# ─────────────────────────────────────────────────────────────────────────────
# POST /
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/", response_model=APIResponse, status_code=status.HTTP_201_CREATED)
async def create_report(
    request: ReportCreateRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    svc: Annotated[CrowdsourceService, Depends(_get_crowdsource_service)],
) -> JSONResponse:
    """
    Submit a new road condition report.

    If a report of the same type exists in the same H3 cell (res 9) within the
    last 10 minutes, the confidence_score of the existing report is incremented
    instead of creating a duplicate. The response includes `duplicate: true` flag
    in that case.

    Reports are published to Kafka `nav.crowdsource.reports` and broadcast to
    nearby active map subscribers via Redis pub/sub.
    """
    report = await svc.create_report(
        user_id=user.user_id,
        report_type=request.report_type,
        lat=request.lat,
        lng=request.lng,
        description=request.description,
        extra_data=request.extra_data,
    )

    http_status = status.HTTP_200_OK if report.get("duplicate") else status.HTTP_201_CREATED
    return JSONResponse(
        status_code=http_status,
        content={"success": True, "data": report},
    )


# ─────────────────────────────────────────────────────────────────────────────
# POST /{report_id}/vote
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/{report_id}/vote",
    response_model=APIResponse,
    status_code=status.HTTP_200_OK,
)
async def vote_report(
    report_id: str,
    vote: ReportVoteRequest,
    user: Annotated[CurrentUser, Depends(get_current_user)],
    svc: Annotated[CrowdsourceService, Depends(_get_crowdsource_service)],
) -> JSONResponse:
    """
    Cast a vote on an existing report.

    Business rules enforced server-side:
    - Cannot vote on own report (ValidationError → 422)
    - Cannot vote twice on same report (ConflictError → 409)
    - Reaching VERIFY_THRESHOLD (3) upvotes → status becomes 'verified'
    - Reaching REJECT_THRESHOLD (-2 net votes) → status becomes 'rejected'
    """
    try:
        uuid.UUID(report_id)
    except ValueError:
        raise ValidationError("Invalid report_id format", detail={"report_id": report_id})

    result = await svc.vote_on_report(
        user_id=user.user_id,
        report_id=report_id,
        vote_type=vote.vote_type,
    )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"success": True, "data": result},
    )


# ─────────────────────────────────────────────────────────────────────────────
# GET /nearby
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/nearby", response_model=APIResponse, status_code=status.HTTP_200_OK)
async def nearby_reports(
    lat: float = Query(..., ge=-90.0, le=90.0),
    lng: float = Query(..., ge=-180.0, le=180.0),
    radius: int = Query(default=5000, ge=100, le=50000, description="Radius in metres"),
    types: str | None = Query(
        default=None,
        description="Comma-separated report types to filter, e.g. accident,police",
    ),
    limit: int = Query(default=50, ge=1, le=200),
    svc: CrowdsourceService = Depends(_get_crowdsource_service),
) -> JSONResponse:
    """
    Return road condition reports within radius_m of given coordinates.

    No authentication required — map display needs to work in guest mode.
    Results include only active/submitted/verified reports that have not expired.
    """
    report_types: list[str] | None = None
    if types:
        report_types = [t.strip() for t in types.split(",") if t.strip()]
        invalid = [t for t in report_types if t not in VALID_REPORT_TYPES]
        if invalid:
            raise ValidationError(
                f"Invalid report types: {invalid}",
                detail={"valid": sorted(VALID_REPORT_TYPES)},
            )

    reports = await svc.get_nearby_reports(
        lat=lat,
        lng=lng,
        radius_m=radius,
        report_types=report_types,
        limit=limit,
    )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"success": True, "data": reports},
    )


# ─────────────────────────────────────────────────────────────────────────────
# GET /heatmap
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/heatmap", response_model=APIResponse, status_code=status.HTTP_200_OK)
async def report_heatmap(
    min_lat: float = Query(..., ge=-90.0, le=90.0),
    min_lng: float = Query(..., ge=-180.0, le=180.0),
    max_lat: float = Query(..., ge=-90.0, le=90.0),
    max_lng: float = Query(..., ge=-180.0, le=180.0),
    report_type: str | None = Query(default=None),
    resolution: int = Query(default=8, ge=5, le=10, description="H3 resolution for aggregation"),
    svc: CrowdsourceService = Depends(_get_crowdsource_service),
) -> JSONResponse:
    """
    Return heatmap data — report counts aggregated per H3 cell within a bounding box.

    No authentication required.
    Max 500 cells returned; client should use resolution 7–8 for city-level view.
    """
    if min_lat >= max_lat or min_lng >= max_lng:
        raise ValidationError(
            "Invalid bounding box: min values must be less than max values",
            detail={"min_lat": min_lat, "min_lng": min_lng, "max_lat": max_lat, "max_lng": max_lng},
        )

    bbox = BBox(min_lat=min_lat, min_lng=min_lng, max_lat=max_lat, max_lng=max_lng)
    heatmap = await svc.get_report_heatmap(
        bbox=bbox,
        report_type=report_type,
        resolution=resolution,
    )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"success": True, "data": heatmap},
    )


# ─────────────────────────────────────────────────────────────────────────────
# GET /{report_id}
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{report_id}", response_model=APIResponse, status_code=status.HTTP_200_OK)
async def get_report(
    report_id: str,
    svc: CrowdsourceService = Depends(_get_crowdsource_service),
) -> JSONResponse:
    """
    Fetch a single report by its UUID.
    Returns 404 if the report doesn't exist.
    No authentication required.
    """
    try:
        uuid.UUID(report_id)
    except ValueError:
        raise ValidationError("Invalid report_id format", detail={"report_id": report_id})

    report = await svc.get_report(report_id)
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"success": True, "data": report},
    )
