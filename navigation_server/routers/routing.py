"""
Navigation Server — Routing Router

POST /api/v1/nav/route            — build route
POST /api/v1/nav/route/optimized  — TSP optimised route
POST /api/v1/nav/matrix           — distance/duration matrix
POST /api/v1/nav/isochrone        — isochrone polygon
"""
from __future__ import annotations

import uuid
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, Request, status

from auth import CurrentUser, get_current_user
from models.common import APIResponse
from models.routing import (
    IsochroneRequest,
    MatrixRequest,
    MatrixResponse,
    OptimizedRouteRequest,
    RouteRequest,
    RouteResponse,
)
from services.routing_service import RoutingService

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/nav", tags=["Routing"])


def _get_routing_service(request: Request) -> RoutingService:
    return request.app.state.routing_service


@router.post(
    "/route",
    response_model=APIResponse[RouteResponse],
    status_code=status.HTTP_200_OK,
    summary="Build a route between origin and destination",
)
async def build_route(
    body: RouteRequest,
    svc: Annotated[RoutingService, Depends(_get_routing_service)],
    user: Annotated[CurrentUser, Depends(get_current_user)],
) -> APIResponse[RouteResponse]:
    trace_id = str(uuid.uuid4())
    logger.info(
        "route.request",
        trace_id=trace_id,
        user_id=user.user_id,
        origin=f"{body.origin.lat},{body.origin.lng}",
        destination=f"{body.destination.lat},{body.destination.lng}",
        costing=body.costing,
    )
    result = await svc.route(body)
    return APIResponse(data=result, trace_id=trace_id)


@router.post(
    "/route/optimized",
    response_model=APIResponse[RouteResponse],
    status_code=status.HTTP_200_OK,
    summary="TSP-optimised multi-stop route",
)
async def optimized_route(
    body: OptimizedRouteRequest,
    svc: Annotated[RoutingService, Depends(_get_routing_service)],
    user: Annotated[CurrentUser, Depends(get_current_user)],
) -> APIResponse[RouteResponse]:
    trace_id = str(uuid.uuid4())
    result = await svc.optimized_route(body)
    return APIResponse(data=result, trace_id=trace_id)


@router.post(
    "/matrix",
    response_model=APIResponse[MatrixResponse],
    status_code=status.HTTP_200_OK,
    summary="Distance/duration matrix between multiple origins and destinations",
)
async def distance_matrix(
    body: MatrixRequest,
    svc: Annotated[RoutingService, Depends(_get_routing_service)],
    user: Annotated[CurrentUser, Depends(get_current_user)],
) -> APIResponse[MatrixResponse]:
    trace_id = str(uuid.uuid4())
    result = await svc.matrix(body)
    return APIResponse(data=result, trace_id=trace_id)


@router.post(
    "/isochrone",
    response_model=APIResponse[dict],
    status_code=status.HTTP_200_OK,
    summary="Compute isochrone polygons around a point",
)
async def isochrone(
    body: IsochroneRequest,
    svc: Annotated[RoutingService, Depends(_get_routing_service)],
    user: Annotated[CurrentUser, Depends(get_current_user)],
) -> APIResponse[dict]:
    trace_id = str(uuid.uuid4())
    result = await svc.isochrone(body)
    return APIResponse(data=result, trace_id=trace_id)
