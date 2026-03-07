"""
Navigation Server — Crowdsourcing & map-edit models.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from models.common import GeoJSONPoint, LatLng


# ── Traffic / incident reports ────────────────────────────────────────────────

REPORT_TYPES = Literal[
    "accident",
    "traffic_jam",
    "road_closed",
    "police",
    "hazard",
    "construction",
    "pothole",
    "flood",
    "ice",
    "wrong_way",
    "other",
]


class ReportCreateRequest(BaseModel):
    type: REPORT_TYPES
    location: LatLng
    description: str | None = Field(default=None, max_length=512)
    direction_deg: float | None = Field(default=None, ge=0.0, lt=360.0)
    severity: Literal["low", "medium", "high"] = "medium"
    photo_url: str | None = None


class Report(BaseModel):
    report_id: str
    type: str
    location: GeoJSONPoint
    description: str | None = None
    direction_deg: float | None = None
    severity: str
    status: Literal["active", "resolved", "expired", "rejected"] = "active"
    upvotes: int = 0
    downvotes: int = 0
    reported_by: str  # user_id
    created_at: datetime
    expires_at: datetime
    resolved_at: datetime | None = None


class ReportVoteRequest(BaseModel):
    vote: Literal["up", "down"]


# ── Map edits (OSM-style) ─────────────────────────────────────────────────────

MAP_EDIT_TYPES = Literal[
    "add_poi",
    "edit_poi",
    "delete_poi",
    "add_road",
    "edit_road",
    "add_restriction",
    "add_speed_limit",
    "correct_address",
]


class MapEditRequest(BaseModel):
    type: MAP_EDIT_TYPES
    location: LatLng
    osm_id: int | None = None
    osm_type: Literal["node", "way", "relation"] | None = None
    tags: dict = Field(default_factory=dict)
    description: str | None = Field(default=None, max_length=1024)
    photo_urls: list[str] = Field(default_factory=list, max_length=5)


class MapEdit(BaseModel):
    edit_id: str
    type: str
    location: GeoJSONPoint
    osm_id: int | None = None
    osm_type: str | None = None
    tags: dict
    description: str | None = None
    status: Literal["pending", "approved", "rejected", "applied"] = "pending"
    submitted_by: str
    reviewed_by: str | None = None
    created_at: datetime
    reviewed_at: datetime | None = None
