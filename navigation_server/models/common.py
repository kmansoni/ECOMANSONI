"""
Navigation Server — Common Pydantic models shared across all routers.
"""
from __future__ import annotations

from typing import Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class LatLng(BaseModel):
    """WGS-84 coordinate pair."""

    lat: float = Field(..., ge=-90.0, le=90.0, description="Latitude in decimal degrees")
    lng: float = Field(..., ge=-180.0, le=180.0, description="Longitude in decimal degrees")

    def as_list(self) -> list[float]:
        """[longitude, latitude] — GeoJSON order."""
        return [self.lng, self.lat]


class BBox(BaseModel):
    """Bounding box in WGS-84."""

    min_lat: float = Field(..., ge=-90.0, le=90.0)
    min_lng: float = Field(..., ge=-180.0, le=180.0)
    max_lat: float = Field(..., ge=-90.0, le=90.0)
    max_lng: float = Field(..., ge=-180.0, le=180.0)

    def as_param(self) -> str:
        """Photon/Nominatim bbox string: min_lng,min_lat,max_lng,max_lat."""
        return f"{self.min_lng},{self.min_lat},{self.max_lng},{self.max_lat}"


class PaginationParams(BaseModel):
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class GeoJSONPoint(BaseModel):
    type: str = Field(default="Point", frozen=True)
    coordinates: list[float] = Field(
        ...,
        min_length=2,
        max_length=3,
        description="[longitude, latitude] or [longitude, latitude, altitude]",
    )

    @classmethod
    def from_latlng(cls, lat: float, lng: float) -> "GeoJSONPoint":
        return cls(coordinates=[lng, lat])


class GeoJSONLineString(BaseModel):
    type: str = Field(default="LineString", frozen=True)
    coordinates: list[list[float]] = Field(
        ...,
        min_length=2,
        description="List of [longitude, latitude] pairs",
    )


class GeoJSONPolygon(BaseModel):
    type: str = Field(default="Polygon", frozen=True)
    coordinates: list[list[list[float]]]


class APIResponse(BaseModel, Generic[T]):
    """Standard envelope for all API responses."""

    success: bool = True
    data: T | None = None
    error: str | None = None
    error_code: str | None = None
    trace_id: str | None = None
