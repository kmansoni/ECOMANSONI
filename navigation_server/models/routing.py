"""
Navigation Server — Routing models (Valhalla-backed).
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from models.common import GeoJSONLineString, LatLng


# ── Request ───────────────────────────────────────────────────────────────────

class RouteRequest(BaseModel):
    origin: LatLng
    destination: LatLng
    waypoints: list[LatLng] = Field(default_factory=list, max_length=23)
    costing: Literal["auto", "taxi", "bicycle", "pedestrian", "truck", "motorcycle"] = "auto"
    costing_options: dict | None = None
    alternatives: int = Field(default=0, ge=0, le=3)
    avoid: list[Literal["tolls", "highways", "ferries", "unpaved"]] = Field(default_factory=list)
    departure_time: datetime | None = None
    language: str = Field(default="ru-RU", max_length=10)


class OptimizedRouteRequest(BaseModel):
    """TSP: find the optimal visit order for a set of locations."""
    locations: list[LatLng] = Field(..., min_length=2, max_length=50)
    costing: Literal["auto", "taxi", "bicycle", "pedestrian", "truck"] = "auto"
    costing_options: dict | None = None


class MatrixRequest(BaseModel):
    origins: list[LatLng] = Field(..., min_length=1, max_length=50)
    destinations: list[LatLng] = Field(..., min_length=1, max_length=50)
    costing: Literal["auto", "taxi", "bicycle", "pedestrian", "truck"] = "auto"


class IsochroneRequest(BaseModel):
    origin: LatLng
    contours_minutes: list[float] = Field(..., min_length=1, max_length=4)
    costing: Literal["auto", "bicycle", "pedestrian"] = "auto"
    polygons: bool = True
    denoise: float = Field(default=1.0, ge=0.0, le=1.0)
    generalize: float = Field(default=150.0, ge=0.0)


# ── Sub-models ────────────────────────────────────────────────────────────────

class RouteManeuver(BaseModel):
    type: int
    instruction: str
    distance_m: float
    duration_s: float
    begin_shape_index: int
    end_shape_index: int
    street_names: list[str] = Field(default_factory=list)
    turn_degree: float | None = None
    travel_mode: str | None = None
    travel_type: str | None = None


class RouteLeg(BaseModel):
    distance_m: float
    duration_s: float
    geometry: GeoJSONLineString
    maneuvers: list[RouteManeuver]


class RouteCost(BaseModel):
    fuel_liters: float | None = None
    fuel_cost_rub: float | None = None
    tolls_cost_rub: float | None = None
    co2_grams: float | None = None


class Route(BaseModel):
    distance_m: float
    duration_s: float
    geometry: GeoJSONLineString  # merged geometry of all legs
    legs: list[RouteLeg]
    summary: str
    cost: RouteCost | None = None
    has_toll: bool = False
    has_highway: bool = False
    has_ferry: bool = False


# ── Response ──────────────────────────────────────────────────────────────────

class RouteResponse(BaseModel):
    routes: list[Route]


class MatrixCell(BaseModel):
    from_index: int
    to_index: int
    distance_m: float | None = None
    duration_s: float | None = None
    status: str = "valid"  # valid | no_route


class MatrixResponse(BaseModel):
    sources: list[LatLng]
    targets: list[LatLng]
    cells: list[MatrixCell]
