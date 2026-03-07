"""
Navigation Server — POI models.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from models.common import GeoJSONPoint, LatLng


class OpeningHoursPeriod(BaseModel):
    open: str  # "HH:MM"
    close: str  # "HH:MM"


class OpeningHours(BaseModel):
    """Per-weekday opening hours (0=Monday … 6=Sunday)."""
    monday: list[OpeningHoursPeriod] = Field(default_factory=list)
    tuesday: list[OpeningHoursPeriod] = Field(default_factory=list)
    wednesday: list[OpeningHoursPeriod] = Field(default_factory=list)
    thursday: list[OpeningHoursPeriod] = Field(default_factory=list)
    friday: list[OpeningHoursPeriod] = Field(default_factory=list)
    saturday: list[OpeningHoursPeriod] = Field(default_factory=list)
    sunday: list[OpeningHoursPeriod] = Field(default_factory=list)
    is_24h: bool = False


class POI(BaseModel):
    id: str
    name: str
    category: str
    subcategory: str | None = None
    location: GeoJSONPoint
    address: str | None = None
    phone: str | None = None
    website: str | None = None
    rating: float | None = Field(default=None, ge=0.0, le=5.0)
    rating_count: int | None = None
    distance_m: float | None = None
    opening_hours: OpeningHours | None = None
    is_open_now: bool | None = None
    tags: dict = Field(default_factory=dict)
    created_at: datetime | None = None
    updated_at: datetime | None = None
    h3_index: str | None = None  # H3 cell at resolution 9


class POISearchRequest(BaseModel):
    location: LatLng
    radius_m: int = Field(default=1000, ge=1, le=50000)
    category: str | None = None
    query: str | None = Field(default=None, max_length=256)
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class POICreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    category: str = Field(..., min_length=1, max_length=64)
    subcategory: str | None = Field(default=None, max_length=64)
    lat: float = Field(..., ge=-90.0, le=90.0)
    lng: float = Field(..., ge=-180.0, le=180.0)
    address: str | None = Field(default=None, max_length=512)
    phone: str | None = Field(default=None, max_length=32)
    website: str | None = Field(default=None, max_length=512)
    opening_hours: OpeningHours | None = None
    tags: dict = Field(default_factory=dict)


class POIUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=256)
    category: str | None = Field(default=None, min_length=1, max_length=64)
    subcategory: str | None = Field(default=None, max_length=64)
    address: str | None = Field(default=None, max_length=512)
    phone: str | None = Field(default=None, max_length=32)
    website: str | None = Field(default=None, max_length=512)
    opening_hours: OpeningHours | None = None
    tags: dict | None = None
