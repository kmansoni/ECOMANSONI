"""
Navigation Server — Geocoding Service (Photon backend)

Cache strategy:
- forward geocode: key = "geocode:fwd:{sha256(query+lat+lng+lang)}", TTL 1h
- reverse geocode: key = "geocode:rev:{lat_rounded}:{lng_rounded}:{lang}", TTL 1h
- autocomplete: NOT cached (user-specific personalisation merged in)

Photon API docs: https://photon.komoot.io/
"""
from __future__ import annotations

import hashlib
import json
from typing import Any

import httpx
import structlog
from tenacity import AsyncRetrying, retry_if_exception_type, stop_after_attempt, wait_exponential

from config import get_settings
from exceptions import GeocodingError, UpstreamError
from models.geocoding import (
    AddressComponents,
    AutocompleteResult,
    GeocodeResult,
)
from models.common import GeoJSONPoint

logger = structlog.get_logger(__name__)


class GeocodingService:
    def __init__(
        self,
        photon_url: str,
        http_client: httpx.AsyncClient,
        redis,  # redis.asyncio.Redis
        db_pool,  # asyncpg.Pool
    ) -> None:
        self._base = str(photon_url).rstrip("/")
        self._http = http_client
        self._redis = redis
        self._db = db_pool
        self._settings = get_settings()

    # ── Forward geocoding ─────────────────────────────────────────────────────

    async def forward(
        self,
        query: str,
        lat: float | None = None,
        lng: float | None = None,
        limit: int = 5,
        lang: str = "default",
    ) -> list[GeocodeResult]:
        """
        Forward geocoding with Redis cache.
        """
        cache_key = self._fwd_cache_key(query, lat, lng, lang, limit)

        cached = await self._redis.get(cache_key)
        if cached:
            raw = json.loads(cached)
            return [GeocodeResult.model_validate(r) for r in raw]

        params: dict[str, Any] = {"q": query, "limit": limit}
        if lat is not None and lng is not None:
            params["lat"] = lat
            params["lon"] = lng
        if lang != "default":
            params["lang"] = lang

        features = await self._query_photon("/api", params)
        results = [self._feature_to_result(f) for f in features]

        # Cache serialised list
        ttl = self._settings.GEOCODE_CACHE_TTL
        serialised = json.dumps([r.model_dump() for r in results])
        await self._redis.setex(cache_key, ttl, serialised)

        return results

    # ── Reverse geocoding ─────────────────────────────────────────────────────

    async def reverse(
        self,
        lat: float,
        lng: float,
        lang: str = "default",
        radius_m: int = 1000,
    ) -> GeocodeResult | None:
        """
        Reverse geocoding. Cache keyed by rounded coordinates (0.001° ≈ 111 m).
        """
        lat_r = round(lat, 3)
        lng_r = round(lng, 3)
        cache_key = f"geocode:rev:{lat_r}:{lng_r}:{lang}"

        cached = await self._redis.get(cache_key)
        if cached:
            return GeocodeResult.model_validate(json.loads(cached))

        params: dict[str, Any] = {
            "lat": lat,
            "lon": lng,
            "limit": 1,
            "radius": radius_m / 1000,  # Photon uses km
        }
        if lang != "default":
            params["lang"] = lang

        features = await self._query_photon("/reverse", params)
        if not features:
            return None

        result = self._feature_to_result(features[0])
        ttl = self._settings.GEOCODE_CACHE_TTL
        await self._redis.setex(cache_key, ttl, result.model_dump_json())

        return result

    # ── Autocomplete ──────────────────────────────────────────────────────────

    async def autocomplete(
        self,
        query: str,
        lat: float | None = None,
        lng: float | None = None,
        limit: int = 5,
        user_id: str | None = None,
    ) -> list[AutocompleteResult]:
        """
        Typeahead search:
        1. Query Photon (bias toward user location)
        2. Merge with user's saved places from DB (prefix match)
        3. Merge with recent searches from DB
        4. Deduplicate and rank by relevance + recency
        5. Return top `limit` results
        """
        photon_params: dict[str, Any] = {
            "q": query,
            "limit": max(limit, 10),  # over-fetch to allow merge
        }
        if lat is not None and lng is not None:
            photon_params["lat"] = lat
            photon_params["lon"] = lng

        features = await self._query_photon("/api", photon_params)
        photon_results = [
            AutocompleteResult(
                label=self._feature_label(f),
                type="geocode",
                location=GeoJSONPoint(
                    coordinates=[f["geometry"]["coordinates"][0],
                                  f["geometry"]["coordinates"][1]]
                ),
                icon=self._category_icon(f.get("properties", {}).get("type", "")),
                address=self._feature_to_address(f.get("properties", {})),
            )
            for f in features
        ]

        combined = photon_results

        if user_id and self._db:
            # Saved places — prefix match on name
            saved = await self._db.fetch(
                """
                SELECT id, name, address, ST_Y(location::geometry) AS lat,
                       ST_X(location::geometry) AS lng
                FROM nav_saved_places
                WHERE user_id = $1 AND name ILIKE $2
                ORDER BY created_at DESC
                LIMIT 5
                """,
                user_id,
                f"{query}%",
            )
            for row in saved:
                combined.insert(
                    0,
                    AutocompleteResult(
                        label=row["name"],
                        type="saved_place",
                        location=GeoJSONPoint(coordinates=[row["lng"], row["lat"]]),
                        icon="bookmark",
                        source_id=str(row["id"]),
                    ),
                )

            # Recent searches
            recent = await self._db.fetch(
                """
                SELECT DISTINCT ON (place_name) place_name, place_lat, place_lng
                FROM nav_search_history
                WHERE user_id = $1 AND place_name ILIKE $2
                ORDER BY place_name, searched_at DESC
                LIMIT 3
                """,
                user_id,
                f"{query}%",
            )
            for row in recent:
                combined.insert(
                    0,
                    AutocompleteResult(
                        label=row["place_name"],
                        type="recent",
                        location=(
                            GeoJSONPoint(coordinates=[row["place_lng"], row["place_lat"]])
                            if row["place_lat"] and row["place_lng"]
                            else None
                        ),
                        icon="history",
                    ),
                )

        # Deduplicate by label, preserve first occurrence
        seen: set[str] = set()
        deduped: list[AutocompleteResult] = []
        for r in combined:
            key = r.label.lower()
            if key not in seen:
                seen.add(key)
                deduped.append(r)

        return deduped[:limit]

    # ── Photon HTTP helper ────────────────────────────────────────────────────

    async def _query_photon(self, path: str, params: dict) -> list[dict]:
        """
        GET Photon endpoint with retry on transient errors.
        Returns list of GeoJSON Feature dicts.
        """
        url = f"{self._base}{path}"
        timeout = self._settings.PHOTON_TIMEOUT

        async for attempt in AsyncRetrying(
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=0.3, min=0.3, max=3.0),
            retry=retry_if_exception_type(UpstreamError),
            reraise=True,
        ):
            with attempt:
                try:
                    resp = await self._http.get(url, params=params, timeout=timeout)
                except (httpx.ConnectError, httpx.TimeoutException) as exc:
                    raise UpstreamError(f"Photon unreachable: {exc}")

                if resp.status_code >= 500:
                    raise UpstreamError(f"Photon server error {resp.status_code}")

                if resp.status_code != 200:
                    raise GeocodingError(f"Photon returned {resp.status_code}")

                data = resp.json()
                return data.get("features", [])

        return []

    # ── Conversion helpers ───────────────────────────────────────────────────

    @staticmethod
    def _feature_label(feature: dict) -> str:
        props = feature.get("properties", {})
        parts: list[str] = []
        for key in ("name", "street", "housenumber", "city", "country"):
            val = props.get(key)
            if val:
                parts.append(str(val))
        return ", ".join(parts) if parts else "Unknown"

    @staticmethod
    def _feature_to_address(props: dict) -> AddressComponents:
        return AddressComponents(
            country=props.get("country"),
            country_code=props.get("countrycode"),
            state=props.get("state"),
            county=props.get("county"),
            city=props.get("city"),
            district=props.get("district"),
            street=props.get("street"),
            house_number=props.get("housenumber"),
            postcode=props.get("postcode"),
        )

    @staticmethod
    def _feature_confidence(feature: dict) -> float:
        """
        Photon does not return a confidence score; approximate from type.
        house → 1.0; street → 0.8; city → 0.6; country → 0.4
        """
        t = feature.get("properties", {}).get("type", "")
        return {"house": 1.0, "street": 0.8, "district": 0.75,
                "city": 0.6, "county": 0.5, "state": 0.45,
                "country": 0.4}.get(t, 0.7)

    def _feature_to_result(self, feature: dict) -> GeocodeResult:
        props = feature.get("properties", {})
        coords = feature.get("geometry", {}).get("coordinates", [0.0, 0.0])
        return GeocodeResult(
            label=self._feature_label(feature),
            location=GeoJSONPoint(coordinates=coords),
            type=props.get("type", "unknown"),
            confidence=self._feature_confidence(feature),
            address=self._feature_to_address(props),
            osm_id=props.get("osm_id"),
            osm_type=props.get("osm_type"),
        )

    @staticmethod
    def _category_icon(osm_type: str) -> str:
        """Map Photon/OSM type strings to icon slugs."""
        mapping = {
            "house": "home",
            "street": "road",
            "city": "city",
            "district": "map",
            "county": "map",
            "state": "map",
            "country": "globe",
            "amenity": "pin",
            "shop": "shopping_bag",
            "restaurant": "fork_knife",
            "cafe": "coffee",
            "hotel": "bed",
            "hospital": "hospital",
            "pharmacy": "pharmacy",
            "fuel": "gas_station",
        }
        return mapping.get(osm_type, "pin")

    @staticmethod
    def _fwd_cache_key(
        query: str,
        lat: float | None,
        lng: float | None,
        lang: str,
        limit: int,
    ) -> str:
        raw = f"{query}|{lat}|{lng}|{lang}|{limit}"
        digest = hashlib.sha256(raw.encode()).hexdigest()[:16]
        return f"geocode:fwd:{digest}"
