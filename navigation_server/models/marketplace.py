"""
Navigation Server — Marketplace / surge pricing / risk models.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ZoneMarketState(BaseModel):
    h3_index: str
    active_drivers: int
    pending_requests: int
    demand_score: float = Field(ge=0.0)
    supply_score: float = Field(ge=0.0)
    surge_multiplier: float = Field(default=1.0, ge=1.0, le=10.0)
    updated_at: datetime


class SurgePricing(BaseModel):
    h3_index: str
    multiplier: float = Field(ge=1.0, le=10.0)
    reason: str | None = None
    valid_until: datetime


class DemandForecast(BaseModel):
    h3_index: str
    forecast_horizon_minutes: int
    predicted_demand: float
    confidence: float = Field(ge=0.0, le=1.0)
    generated_at: datetime


class RiskEvent(BaseModel):
    event_id: str
    type: Literal["accident", "flood", "crime", "political", "weather", "construction"]
    location_h3: str
    severity: Literal["low", "medium", "high", "critical"]
    description: str | None = None
    source: str
    created_at: datetime
    expires_at: datetime | None = None


class RiskScore(BaseModel):
    h3_index: str
    score: float = Field(ge=0.0, le=100.0, description="0=safe, 100=extreme risk")
    events: list[RiskEvent] = Field(default_factory=list)
    computed_at: datetime
