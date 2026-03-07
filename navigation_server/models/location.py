"""
Navigation Server — Real-time location models.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from models.common import GeoJSONPoint, LatLng


class LocationUpdate(BaseModel):
    """Inbound location ping from driver/user app."""
    actor_type: Literal["user", "driver", "vehicle"]
    lat: float = Field(..., ge=-90.0, le=90.0)
    lng: float = Field(..., ge=-180.0, le=180.0)
    accuracy_m: float | None = Field(default=None, ge=0.0, le=10000.0)
    heading_deg: float | None = Field(default=None, ge=0.0, lt=360.0)
    speed_mps: float | None = Field(default=None, ge=0.0, le=200.0)
    altitude_m: float | None = None
    session_id: str | None = None
    trip_id: str | None = None
    timestamp: datetime | None = None


class NearbySearchRequest(BaseModel):
    location: LatLng
    radius_m: int = Field(default=3000, ge=100, le=50000)
    actor_type: Literal["driver", "user", "vehicle"] = "driver"
    vehicle_class: str | None = None
    limit: int = Field(default=20, ge=1, le=100)


class NearbyResult(BaseModel):
    actor_id: str
    actor_type: str
    location: GeoJSONPoint
    distance_m: float
    eta_s: float | None = None
    heading_deg: float | None = None
    speed_mps: float | None = None
    vehicle_class: str | None = None
    last_seen_at: datetime | None = None


class LocationShareRequest(BaseModel):
    """Start a live location share session."""
    duration_minutes: int = Field(default=60, ge=1, le=1440)
    recipient_user_ids: list[str] = Field(default_factory=list, max_length=50)


class LocationShareResponse(BaseModel):
    share_id: str
    share_url: str
    expires_at: datetime
