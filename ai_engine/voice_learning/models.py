from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal


ValidationStatus = Literal["confirmed", "provisional", "pending_review", "rejected"]


@dataclass(slots=True)
class ParsedAddress:
    raw_text: str
    normalized_text: str
    locale: str
    components: dict[str, str] = field(default_factory=dict)
    confidence: float = 0.0
    order_pattern: str | None = None
    source: str = "rule_based"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class NoveltyAssessment:
    score: float
    reasons: list[str] = field(default_factory=list)
    hotspot: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class ValidationResult:
    status: ValidationStatus
    confidence: float
    normalized_query: str
    provider_candidates: list[str] = field(default_factory=list)
    reasons: list[str] = field(default_factory=list)
    coordinates: dict[str, float] | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class HotspotPackage:
    hotspot_id: str
    transcript: str
    normalized_transcript: str
    novelty_score: float
    reasons: list[str]
    text_variants: list[str] = field(default_factory=list)
    synthetic_jobs: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)