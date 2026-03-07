"""
Navigation Server — Geocoding models.
"""
from __future__ import annotations

from pydantic import BaseModel, Field

from models.common import GeoJSONPoint, LatLng


class AddressComponents(BaseModel):
    country: str | None = None
    country_code: str | None = None
    state: str | None = None
    county: str | None = None
    city: str | None = None
    district: str | None = None
    street: str | None = None
    house_number: str | None = None
    postcode: str | None = None


class GeocodeResult(BaseModel):
    label: str
    location: GeoJSONPoint
    type: str  # city, street, house, amenity, …
    confidence: float = Field(ge=0.0, le=1.0)
    address: AddressComponents
    osm_id: int | None = None
    osm_type: str | None = None  # N, W, R


class ForwardGeocodeRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=512)
    lat: float | None = Field(default=None, ge=-90.0, le=90.0)
    lng: float | None = Field(default=None, ge=-180.0, le=180.0)
    limit: int = Field(default=5, ge=1, le=20)
    lang: str = Field(default="default", max_length=10)
    bbox: str | None = Field(default=None, description="min_lng,min_lat,max_lng,max_lat")


class ReverseGeocodeRequest(BaseModel):
    lat: float = Field(..., ge=-90.0, le=90.0)
    lng: float = Field(..., ge=-180.0, le=180.0)
    lang: str = Field(default="default", max_length=10)
    radius_m: int = Field(default=1000, ge=1, le=50000)


class AutocompleteRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=256)
    lat: float | None = Field(default=None, ge=-90.0, le=90.0)
    lng: float | None = Field(default=None, ge=-180.0, le=180.0)
    limit: int = Field(default=5, ge=1, le=10)
    lang: str = Field(default="default", max_length=10)


class AutocompleteResult(BaseModel):
    label: str
    type: str  # geocode | saved_place | recent | poi
    location: GeoJSONPoint | None = None
    icon: str | None = None  # category icon slug
    source_id: str | None = None  # saved_place id or poi id
    address: AddressComponents | None = None
