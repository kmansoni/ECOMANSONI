from __future__ import annotations

import re

from .models import ParsedAddress
from .normalization import normalize_basic_text, normalize_russian_address_text


class UniversalAddressParser:
    RU_PATTERNS = (
        (
            re.compile(
                r"^(?P<street>[а-яa-z\-\s]+?)\s+(?P<house>\d+[а-яa-z]?)\s+(?:корпус|корп|к)\s*(?P<corpus>\d+[а-яa-z]?)$",
                re.IGNORECASE,
            ),
            "street house_number corpus",
        ),
        (
            re.compile(
                r"^(?P<street>[а-яa-z\-\s]+?)\s+(?P<house>\d+[а-яa-z]?)$",
                re.IGNORECASE,
            ),
            "street house_number",
        ),
        (
            re.compile(
                r"^(?P<house>\d+[а-яa-z]?)\s+(?:корпус|корп|к)\s*(?P<corpus>\d+[а-яa-z]?)\s+(?P<street>[а-яa-z\-\s]+)$",
                re.IGNORECASE,
            ),
            "house_number corpus street",
        ),
    )

    GENERIC_PATTERN = re.compile(
        r"^(?P<house>\d+[a-z]?)\s+(?P<street>[a-z\-\s]+?)(?:\s+(?P<city>[a-z\-\s]+))?$",
        re.IGNORECASE,
    )

    def parse(
        self,
        text: str,
        locale_hint: str | None = None,
        user_context: dict[str, str] | None = None,
    ) -> ParsedAddress | None:
        if not text.strip():
            return None

        locale = (locale_hint or self._detect_locale(text)).lower()
        if locale.startswith("ru"):
            parsed = self._parse_ru(text, user_context or {})
        else:
            parsed = self._parse_generic(text, locale, user_context or {})

        return parsed

    def _detect_locale(self, text: str) -> str:
        if re.search(r"[а-яё]", text, re.IGNORECASE):
            return "ru"
        return "en"

    def _parse_ru(self, text: str, user_context: dict[str, str]) -> ParsedAddress | None:
        normalized = normalize_russian_address_text(text)
        for pattern, order_pattern in self.RU_PATTERNS:
            match = pattern.match(normalized)
            if not match:
                continue

            components = {
                "road": self._title_ru(match.group("street")),
                "house_number": match.group("house"),
            }

            corpus = match.groupdict().get("corpus")
            if corpus:
                components["corpus"] = corpus
            if user_context.get("city"):
                components["locality"] = user_context["city"]
            if user_context.get("country"):
                components["country"] = user_context["country"]

            confidence = 0.86 if corpus else 0.8
            return ParsedAddress(
                raw_text=text,
                normalized_text=normalized,
                locale="ru",
                components=components,
                confidence=confidence,
                order_pattern=order_pattern,
            )

        return None

    def _parse_generic(self, text: str, locale: str, user_context: dict[str, str]) -> ParsedAddress | None:
        normalized = normalize_basic_text(text)
        match = self.GENERIC_PATTERN.match(normalized)
        if not match:
            return None

        components = {
            "house_number": match.group("house"),
            "road": self._title_generic(match.group("street")),
        }
        if match.groupdict().get("city"):
            components["locality"] = self._title_generic(match.group("city"))
        elif user_context.get("city"):
            components["locality"] = user_context["city"]
        if user_context.get("country"):
            components["country"] = user_context["country"]

        return ParsedAddress(
            raw_text=text,
            normalized_text=normalized,
            locale=locale,
            components=components,
            confidence=0.74,
            order_pattern="house_number street",
        )

    def _title_ru(self, value: str) -> str:
        return " ".join(token.capitalize() for token in value.split())

    def _title_generic(self, value: str) -> str:
        return " ".join(token.capitalize() for token in value.split())