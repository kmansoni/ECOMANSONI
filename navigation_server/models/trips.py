"""
Navigation Server — Trip / Dispatch models.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from models.common import GeoJSONPoint, LatLng


# ── Trip request & response ───────────────────────────────────────────────────

class TripCreateRequest(BaseModel):
    pickup: LatLng
    dropoff: LatLng
    waypoints: list[LatLng] = Field(default_factory=list, max_length=5)
    service_type: Literal["standard", "comfort", "business", "cargo", "shared"] = "standard"
    payment_method: Literal["cash", "card", "wallet", "corporate"] = "card"
    promo_code: str | None = Field(default=None, max_length=32)
    idempotency_key: str = Field(..., min_length=8, max_length=64)
    notes: str | None = Field(default=None, max_length=256)
    scheduled_at: datetime | None = None


class TripPassenger(BaseModel):
    user_id: str
    name: str
    phone: str | None = None


class TripDriver(BaseModel):
    driver_id: str
    name: str
    phone: str | None = None
    rating: float | None = Field(default=None, ge=0.0, le=5.0)
    vehicle_plate: str | None = None
    vehicle_model: str | None = None
    vehicle_color: str | None = None
    current_location: GeoJSONPoint | None = None


class TripRoute(BaseModel):
    distance_m: float
    duration_s: float
    polyline: str  # encoded polyline


class TripPrice(BaseModel):
    currency: str = "RUB"
    base_fare: float
    distance_fare: float
    time_fare: float
    surge_multiplier: float = 1.0
    surge_amount: float = 0.0
    promo_discount: float = 0.0
    total: float
    is_estimate: bool = True


class TripResponse(BaseModel):
    trip_id: str
    status: str
    service_type: str
    passenger: TripPassenger | None = None
    driver: TripDriver | None = None
    pickup: GeoJSONPoint
    dropoff: GeoJSONPoint
    route: TripRoute | None = None
    price: TripPrice
    created_at: datetime
    updated_at: datetime
    pickup_eta_s: float | None = None
    scheduled_at: datetime | None = None


class TripStatusUpdate(BaseModel):
    trip_id: str
    status: Literal[
        "searching",
        "driver_assigned",
        "driver_en_route",
        "arrived",
        "in_progress",
        "completed",
        "cancelled",
        "no_drivers",
    ]
    reason: str | None = None


# ── Dispatch offer ────────────────────────────────────────────────────────────

class DispatchOffer(BaseModel):
    offer_id: str
    trip_id: str
    driver_id: str
    pickup_eta_s: float
    price: TripPrice
    route: TripRoute
    expires_at: datetime


class OfferResponse(BaseModel):
    offer_id: str
    action: Literal["accept", "reject"]
