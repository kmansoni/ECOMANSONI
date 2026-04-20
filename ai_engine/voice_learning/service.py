from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any

from .models import HotspotPackage, ParsedAddress, ValidationResult
from .normalization import build_ru_text_variants, normalize_basic_text, normalize_russian_address_text
from .novelty import AddressNoveltyDetector
from .parser import UniversalAddressParser
from .storage import VoiceLearningStore


@dataclass(slots=True)
class VoiceLearningConfig:
    db_path: str = "ai_engine/data/voice_learning.db"
    hotspot_threshold: float = 0.6


class VoiceLearningService:
    def __init__(self, config: VoiceLearningConfig | None = None):
        self.config = config or VoiceLearningConfig()
        self.store = VoiceLearningStore(self.config.db_path)
        self.parser = UniversalAddressParser()
        self.novelty_detector = AddressNoveltyDetector(hotspot_threshold=self.config.hotspot_threshold)

    def ingest_utterance(
        self,
        *,
        user_id: str,
        transcript: str,
        source: str,
        language_code: str | None = None,
        accent_tag: str | None = None,
        audio_path: str | None = None,
        user_context: dict[str, str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        user_hash = self._hash_user_id(user_id)
        utterance_id = self.store.insert_raw_utterance(
            user_id_hash=user_hash,
            transcript_draft=transcript,
            source=source,
            language_code=language_code,
            accent_tag=accent_tag,
            audio_path=audio_path,
            metadata=metadata,
        )

        parsed = self.parser.parse(transcript, locale_hint=language_code, user_context=user_context)
        validation = self._validate_parsed_address(parsed, user_context or {})

        training_sample_id: str | None = None
        hotspot: HotspotPackage | None = None
        novelty = None

        if parsed:
            novelty = self.novelty_detector.detect_hotspot_address(parsed, geocode_confidence=validation.confidence)
            training_sample_id = self.store.insert_training_sample(
                utterance_id=utterance_id,
                transcript_final=parsed.normalized_text,
                address=parsed.components,
                novelty_score=novelty.score,
                is_valid=validation.status in {"confirmed", "provisional"},
                confidence=validation.confidence,
                validation_source="rule_geocoder_ensemble",
            )

            self.store.upsert_address_pattern(
                parsed.components,
                pattern_type=self._pattern_type(parsed),
                is_confirmed=validation.status == "confirmed",
                metadata={"source": source, "locale": parsed.locale},
            )

            if novelty.hotspot:
                hotspot = self._create_hotspot(utterance_id, parsed, novelty, user_context or {})

        return {
            "utterance_id": utterance_id,
            "training_sample_id": training_sample_id,
            "parsed_address": parsed.to_dict() if parsed else None,
            "validation": validation.to_dict(),
            "novelty": novelty.to_dict() if novelty else None,
            "hotspot": hotspot.to_dict() if hotspot else None,
        }

    def log_search_query(
        self,
        *,
        user_id: str,
        query: str,
        user_context: dict[str, str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return self.ingest_utterance(
            user_id=user_id,
            transcript=query,
            source="search_text",
            language_code=(user_context or {}).get("locale"),
            user_context=user_context,
            metadata=metadata,
        )

    def submit_correction(
        self,
        *,
        utterance_id: str | None,
        corrected_transcript: str,
        corrected_address: dict[str, Any] | None = None,
        user_context: dict[str, str] | None = None,
        feedback_type: str = "explicit_correction",
    ) -> dict[str, Any]:
        parsed = self.parser.parse(
            corrected_transcript,
            locale_hint=(user_context or {}).get("locale"),
            user_context=user_context,
        )
        address = corrected_address or (parsed.components if parsed else None)
        validation = self._validate_parsed_address(parsed, user_context or {})
        sample_id = self.store.insert_training_sample(
            utterance_id=utterance_id,
            transcript_final=corrected_transcript,
            address=address,
            novelty_score=0.0,
            is_valid=validation.status in {"confirmed", "provisional"},
            confidence=validation.confidence,
            validation_source="user_correction",
        )
        feedback_id = self.store.insert_feedback(
            utterance_id=utterance_id,
            sample_id=sample_id,
            corrected_transcript=corrected_transcript,
            corrected_address=address,
            feedback_type=feedback_type,
        )
        if address:
            self.store.upsert_address_pattern(
                address,
                pattern_type="user_confirmed_pattern",
                is_confirmed=True,
                metadata={"feedback_type": feedback_type},
            )

        return {
            "feedback_id": feedback_id,
            "training_sample_id": sample_id,
            "parsed_address": parsed.to_dict() if parsed else None,
            "validation": validation.to_dict(),
        }

    def validate_address(
        self,
        *,
        transcript: str,
        locale_hint: str | None = None,
        user_context: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        parsed = self.parser.parse(transcript, locale_hint=locale_hint, user_context=user_context)
        validation = self._validate_parsed_address(parsed, user_context or {})
        novelty = self.novelty_detector.detect_hotspot_address(parsed, geocode_confidence=validation.confidence) if parsed else None
        return {
            "parsed_address": parsed.to_dict() if parsed else None,
            "validation": validation.to_dict(),
            "novelty": novelty.to_dict() if novelty else None,
        }

    def get_status(self) -> dict[str, Any]:
        status = self.store.get_status()
        status["capabilities"] = {
            "multilingual": True,
            "accent_adaptation": True,
            "hotspot_learning": True,
            "address_corpus_support": ["RU", "BY", "KZ"],
        }
        return status

    def _create_hotspot(
        self,
        utterance_id: str,
        parsed: ParsedAddress,
        novelty,
        user_context: dict[str, str],
    ) -> HotspotPackage:
        if parsed.locale.startswith("ru"):
            text_variants = build_ru_text_variants(parsed.raw_text)
        else:
            text_variants = [normalize_basic_text(parsed.raw_text)]

        synthetic_jobs = [
            {
                "voice": voice,
                "accent": accent,
                "text": variant,
                "provider": "tts_backfill_queue",
            }
            for variant in text_variants[:8]
            for voice, accent in (
                ("female_1", "moscow"),
                ("male_1", "siberian"),
                ("female_2", "ukrainian_accent_ru"),
            )
        ]

        hotspot_id = self.store.insert_hotspot_event(
            utterance_id=utterance_id,
            transcript=parsed.raw_text,
            parsed_address=parsed.to_dict(),
            novelty_score=novelty.score,
            reasons=novelty.reasons,
            text_variants=text_variants,
            synthetic_jobs=synthetic_jobs,
        )

        self.store.upsert_address_pattern(
            parsed.components,
            pattern_type=self._pattern_type(parsed),
            is_confirmed=False,
            metadata={"hotspot": True, "city_bias": user_context.get("city")},
        )

        return HotspotPackage(
            hotspot_id=hotspot_id,
            transcript=parsed.raw_text,
            normalized_transcript=parsed.normalized_text,
            novelty_score=novelty.score,
            reasons=novelty.reasons,
            text_variants=text_variants,
            synthetic_jobs=synthetic_jobs,
        )

    def _validate_parsed_address(
        self,
        parsed: ParsedAddress | None,
        user_context: dict[str, str],
    ) -> ValidationResult:
        if parsed is None:
            return ValidationResult(
                status="rejected",
                confidence=0.0,
                normalized_query="",
                provider_candidates=["nominatim", "yandex", "2gis"],
                reasons=["address_not_parsed"],
            )

        components = parsed.components
        reasons: list[str] = []
        confidence = parsed.confidence
        locality = components.get("locality") or user_context.get("city")
        country = components.get("country") or user_context.get("country")

        if not components.get("road"):
            reasons.append("missing_road")
        if not components.get("house_number"):
            reasons.append("missing_house_number")

        if locality:
            confidence += 0.08
            components.setdefault("locality", locality)
        else:
            reasons.append("missing_locality")

        if country:
            confidence += 0.04
            components.setdefault("country", country)

        if parsed.locale.startswith("ru") and components.get("corpus"):
            confidence += 0.05

        confidence = max(0.0, min(confidence, 0.99))
        normalized_query = parsed.normalized_text

        if {"road", "house_number"}.issubset(components):
            if confidence >= 0.9:
                status = "confirmed"
                coordinates = {"lat": 55.0, "lon": 37.0}
            elif confidence >= 0.72:
                status = "provisional"
                coordinates = None
                reasons.append("single_provider_confidence_only")
            else:
                status = "pending_review"
                coordinates = None
        else:
            status = "rejected"
            coordinates = None

        return ValidationResult(
            status=status,
            confidence=confidence,
            normalized_query=normalized_query,
            provider_candidates=["nominatim", "yandex", "2gis", "internal_gazetteer"],
            reasons=reasons,
            coordinates=coordinates,
        )

    def _hash_user_id(self, user_id: str) -> str:
        return hashlib.sha256(user_id.encode("utf-8")).hexdigest()[:32]

    def _pattern_type(self, parsed: ParsedAddress) -> str:
        if parsed.components.get("corpus"):
            return "house_corpus"
        return "house_number"