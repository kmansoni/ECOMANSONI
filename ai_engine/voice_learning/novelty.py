from __future__ import annotations

from dataclasses import dataclass, field

from .models import NoveltyAssessment, ParsedAddress


@dataclass(slots=True)
class GazetteerSnapshot:
    streets_by_city: dict[str, set[str]] = field(default_factory=dict)
    corpus_patterns_by_country: dict[str, bool] = field(default_factory=lambda: {"RU": True, "BY": True, "KZ": True})

    def street_exists(self, street: str, city: str | None) -> bool:
        if not city:
            return False
        known = self.streets_by_city.get(city.lower(), set())
        return street.lower() in known

    def corpus_allowed(self, country: str | None) -> bool:
        if not country:
            return False
        return self.corpus_patterns_by_country.get(country.upper(), False)


class AddressNoveltyDetector:
    def __init__(self, gazetteer: GazetteerSnapshot | None = None, hotspot_threshold: float = 0.6):
        self.gazetteer = gazetteer or GazetteerSnapshot()
        self.hotspot_threshold = hotspot_threshold

    def calculate_address_novelty(
        self,
        parsed: ParsedAddress,
        geocode_confidence: float = 0.0,
    ) -> NoveltyAssessment:
        score = 0.0
        reasons: list[str] = []
        components = parsed.components

        street = components.get("road")
        city = components.get("locality")
        country = components.get("country")
        corpus = components.get("corpus")

        if street and not self.gazetteer.street_exists(street, city):
            score += 0.4
            reasons.append("street_not_in_gazetteer")

        if street and corpus and not self.gazetteer.street_exists(street, city):
            score += 0.25
            reasons.append("street_house_corpus_unseen")

        if corpus and not self.gazetteer.corpus_allowed(country):
            score += 0.2
            reasons.append("corpus_uncommon_for_country")

        if parsed.order_pattern not in {"street house_number", "street house_number corpus"}:
            score += 0.2
            reasons.append("unusual_order")

        if geocode_confidence < 0.7:
            score += 0.2
            reasons.append("low_geocode_confidence")

        if not city:
            score += 0.1
            reasons.append("missing_locality_context")

        final_score = min(score, 1.0)
        return NoveltyAssessment(
            score=final_score,
            reasons=reasons,
            hotspot=final_score >= self.hotspot_threshold,
        )

    def detect_hotspot_address(self, parsed: ParsedAddress, geocode_confidence: float = 0.0) -> NoveltyAssessment:
        return self.calculate_address_novelty(parsed, geocode_confidence=geocode_confidence)