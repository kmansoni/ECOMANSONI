"""
Navigation Server — Location Ingest Service (GPS Ingest Pipeline).

Pipeline per update:
  1. GPS quality validation (accuracy, impossible speed, jump detection)
  2. H3 index computation (resolution 9)
  3. Redis presence update (TTL 30s)
  4. Redis GEO index update (GEOADD)
  5. Kafka publish → nav.location.raw
  6. PostGIS async insert → nav_location_history
  7. Return acknowledgement with freshness metadata

Concurrency model:
  - Steps 3-6 run concurrently via asyncio.gather after validation
  - DB insert is fire-and-forget (task) to avoid blocking ingest latency
  - Batch ingest processes updates sequentially per actor to preserve order

Attack surface mitigations:
  - accuracy_m > 100m → discard (prevents GPS spoofing with low precision)
  - speed > 80 m/s → flag (impossible in city network)
  - jump > physics allows → flag (teleportation attack / replay)
  - coordinates out of WGS-84 range → hard reject
  - actor_id comes from JWT (server-side), never from request body
"""
from __future__ import annotations

import asyncio
import math
import time
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog

from exceptions import GeoError, ValidationError  # type: ignore[import]
from models.location import LocationUpdate
from services.h3_service import H3Service

logger = structlog.get_logger(__name__)

# Physics constants
MAX_ACCURACY_M = 100.0          # Discard GPS fix with accuracy worse than this
MAX_SPEED_MPS = 80.0            # 288 km/h — hard physical limit for road vehicles
JUMP_TOLERANCE_FACTOR = 1.5    # Allow 50% slack on expected position by speed*dt
MIN_TIMEDELTA_S = 0.5           # Ignore updates arriving <0.5s apart (de-dup)
EARTH_RADIUS_M = 6_371_000.0

PRESENCE_TTL_S = 30             # Redis TTL for presence key
KAFKA_TOPIC_RAW = "nav.location.raw"


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in metres between two WGS-84 points."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


class LocationService:
    """Location Ingest — receives GPS pings from driver/user/vehicle actors."""

    def __init__(
        self,
        db_pool: Any,
        redis: Any,
        kafka_producer: Any,
        h3_service: H3Service,
        presence_service: Any,
    ) -> None:
        self.db = db_pool
        self.redis = redis
        self.kafka = kafka_producer
        self.h3 = h3_service
        self.presence = presence_service

    # -------------------------------------------------------------------------
    # Public API
    # -------------------------------------------------------------------------

    async def ingest_location(self, user_id: str, update: LocationUpdate) -> dict:
        """
        Single GPS ping ingest.
        Returns {h3_index, freshness_ms, discarded, discard_reason}.
        Raises GeoError for hard-reject coordinates.
        """
        ts_recv = time.monotonic()

        is_valid, reason = await self._validate_gps(user_id, update)
        if not is_valid:
            logger.warning(
                "location.discarded",
                user_id=user_id,
                reason=reason,
                lat=update.lat,
                lng=update.lng,
            )
            return {"discarded": True, "discard_reason": reason}

        h3_index = self.h3.latlng_to_h3(update.lat, update.lng, resolution=9)
        recorded_at = update.timestamp or datetime.now(timezone.utc)

        # Fan-out: presence + geo + kafka concurrently; db is fire-and-forget
        await asyncio.gather(
            self.presence.update_presence(
                actor_id=user_id,
                actor_type=update.actor_type,
                lat=update.lat,
                lng=update.lng,
                extra={
                    "accuracy_m": update.accuracy_m,
                    "heading_deg": update.heading_deg,
                    "speed_mps": update.speed_mps,
                    "h3_r9": h3_index,
                    "session_id": update.session_id,
                },
            ),
            self._update_geo_index(user_id, update),
            self._publish_to_kafka(user_id, update, h3_index, recorded_at),
        )

        # DB insert is non-blocking — we don't wait for durability on the hot path
        asyncio.create_task(
            self._store_to_db(user_id, update, h3_index, recorded_at),
            name=f"loc_db_{user_id}",
        )

        freshness_ms = round((time.monotonic() - ts_recv) * 1000, 2)
        logger.debug(
            "location.ingested",
            user_id=user_id,
            actor_type=update.actor_type,
            h3_index=h3_index,
            freshness_ms=freshness_ms,
        )
        return {
            "discarded": False,
            "h3_index": h3_index,
            "freshness_ms": freshness_ms,
        }

    async def batch_ingest(self, user_id: str, updates: list[LocationUpdate]) -> dict:
        """
        Batch ingest for offline-buffered coordinates.
        Processes in chronological order; returns per-update results.
        At most 500 updates per call to prevent DoS via oversized payloads.
        """
        if len(updates) > 500:
            raise ValidationError(  # type: ignore[name-defined]
                "Batch size exceeds maximum of 500 updates",
                detail={"received": len(updates), "max": 500},
            )

        # Sort by timestamp ascending (clients may buffer out-of-order)
        sorted_updates = sorted(
            updates,
            key=lambda u: u.timestamp or datetime.min.replace(tzinfo=timezone.utc),
        )

        results = []
        for upd in sorted_updates:
            result = await self.ingest_location(user_id, upd)
            results.append(result)

        accepted = sum(1 for r in results if not r.get("discarded"))
        discarded = len(results) - accepted
        logger.info(
            "location.batch_ingested",
            user_id=user_id,
            total=len(results),
            accepted=accepted,
            discarded=discarded,
        )
        return {"accepted": accepted, "discarded": discarded, "results": results}

    async def get_location_history(
        self,
        user_id: str,
        start: datetime,
        end: datetime,
        limit: int = 1000,
    ) -> list[dict]:
        """
        Fetch location history for a user from PostGIS nav_location_history.
        Limit capped at 10_000 to prevent runaway queries.
        """
        if limit > 10_000:
            limit = 10_000

        rows = await self.db.fetch_all(
            """
            SELECT
                actor_id,
                actor_type,
                ST_Y(location::geometry) AS lat,
                ST_X(location::geometry) AS lng,
                accuracy_m,
                heading_deg,
                speed_mps,
                session_id,
                trip_id,
                h3_index_r9,
                recorded_at
            FROM nav_location_history
            WHERE actor_id = $1
              AND recorded_at >= $2
              AND recorded_at <= $3
            ORDER BY recorded_at ASC
            LIMIT $4
            """,
            str(user_id),
            start,
            end,
            limit,
        )
        return [dict(r) for r in rows]

    # -------------------------------------------------------------------------
    # GPS Validation
    # -------------------------------------------------------------------------

    async def _validate_gps(
        self, user_id: str, update: LocationUpdate
    ) -> tuple[bool, str | None]:
        """
        Multi-stage GPS quality gate.

        Stage 1 — coordinate sanity (hard reject, raises GeoError for out-of-range)
        Stage 2 — accuracy filter
        Stage 3 — speed plausibility
        Stage 4 — jump detection against last known position

        Returns (True, None) for valid; (False, reason) for soft discard.
        Hard-invalid coordinates raise GeoError immediately.
        """
        # Stage 1: coordinate range — Pydantic already validates [-90,90] / [-180,180],
        # but we also reject (0, 0) null-island, which is a common GPS bug.
        if abs(update.lat) < 0.0001 and abs(update.lng) < 0.0001:
            raise GeoError(
                "Null-island coordinates rejected",
                detail={"lat": update.lat, "lng": update.lng},
            )

        # Stage 2: accuracy
        if update.accuracy_m is not None and update.accuracy_m > MAX_ACCURACY_M:
            return False, f"accuracy_m={update.accuracy_m:.1f} exceeds {MAX_ACCURACY_M}m threshold"

        # Stage 3: reported speed
        if update.speed_mps is not None and update.speed_mps > MAX_SPEED_MPS:
            return False, f"reported speed {update.speed_mps:.1f} m/s exceeds {MAX_SPEED_MPS} m/s limit"

        # Stage 4: jump detection
        last = await self._get_last_known_location(user_id)
        if last is not None:
            last_lat = last.get("lat")
            last_lng = last.get("lng")
            last_ts = last.get("ts")

            if last_lat is not None and last_lng is not None and last_ts is not None:
                try:
                    last_time = datetime.fromisoformat(last_ts)
                    now_time = update.timestamp or datetime.now(timezone.utc)
                    if last_time.tzinfo is None:
                        last_time = last_time.replace(tzinfo=timezone.utc)
                    if now_time.tzinfo is None:
                        now_time = now_time.replace(tzinfo=timezone.utc)

                    dt_s = (now_time - last_time).total_seconds()

                    if dt_s < MIN_TIMEDELTA_S:
                        # Too soon — deduplicate silently
                        return False, "duplicate: update too soon after previous"

                    if dt_s > 0:
                        distance_m = _haversine_m(last_lat, last_lng, update.lat, update.lng)
                        # Max plausible displacement = physics cap * elapsed * tolerance
                        max_plausible_m = MAX_SPEED_MPS * dt_s * JUMP_TOLERANCE_FACTOR
                        if distance_m > max_plausible_m:
                            logger.warning(
                                "location.jump_detected",
                                user_id=user_id,
                                distance_m=round(distance_m),
                                max_plausible_m=round(max_plausible_m),
                                dt_s=round(dt_s, 1),
                            )
                            return (
                                False,
                                f"jump detected: {distance_m:.0f}m in {dt_s:.1f}s "
                                f"(max plausible {max_plausible_m:.0f}m)",
                            )
                except (ValueError, TypeError):
                    # Unparseable last timestamp — skip jump check, allow update
                    pass

        return True, None

    # -------------------------------------------------------------------------
    # Internal helpers
    # -------------------------------------------------------------------------

    async def _get_last_known_location(self, user_id: str) -> dict | None:
        """Retrieve last presence record from Redis for jump detection."""
        # We iterate over possible actor types — presence key is
        # presence:{actor_type}:{actor_id}; we don't know the type here,
        # so we check all three. The driver/vehicle path is hot; user is cold.
        for actor_type in ("driver", "vehicle", "user"):
            data = await self.redis.get_json(f"presence:{actor_type}:{user_id}")
            if data is not None:
                return data
        return None

    async def _update_geo_index(
        self, user_id: str, update: LocationUpdate, city_id: str = "default"
    ) -> None:
        """
        GEOADD geo:{city}:{actor_type}s {lng} {lat} {user_id}
        Key convention: geo:default:drivers, geo:default:vehicles, geo:default:users
        """
        geo_key = f"geo:{city_id}:{update.actor_type}s"
        await self.redis.geo_add(geo_key, update.lng, update.lat, user_id)

    async def _publish_to_kafka(
        self,
        user_id: str,
        update: LocationUpdate,
        h3_index: str,
        recorded_at: datetime,
    ) -> None:
        """Publish raw location event to nav.location.raw (24 partitions, keyed by actor_id)."""
        event = {
            "actor_id": user_id,
            "actor_type": update.actor_type,
            "lat": update.lat,
            "lng": update.lng,
            "accuracy_m": update.accuracy_m,
            "heading_deg": update.heading_deg,
            "speed_mps": update.speed_mps,
            "h3_r9": h3_index,
            "session_id": update.session_id,
            "trip_id": update.trip_id,
            "recorded_at": recorded_at.isoformat(),
        }
        await self.kafka.produce_event(
            topic=KAFKA_TOPIC_RAW,
            key=user_id,
            value=event,
        )

    async def _store_to_db(
        self,
        user_id: str,
        update: LocationUpdate,
        h3_index: str,
        recorded_at: datetime,
    ) -> None:
        """
        INSERT INTO nav_location_history using PostGIS ST_MakePoint.
        Fire-and-forget — errors are logged but not propagated to caller.
        """
        try:
            await self.db.execute_query(
                """
                INSERT INTO nav_location_history (
                    actor_id, actor_type, location,
                    accuracy_m, heading_deg, speed_mps,
                    session_id, trip_id, h3_index_r9, recorded_at
                ) VALUES (
                    $1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326),
                    $5, $6, $7,
                    $8, $9, $10, $11
                )
                """,
                str(user_id),
                update.actor_type,
                update.lng,         # ST_MakePoint(lng, lat) — PostGIS convention
                update.lat,
                update.accuracy_m,
                update.heading_deg,
                update.speed_mps,
                update.session_id,
                update.trip_id,
                h3_index,
                recorded_at,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "location.db_insert_failed",
                user_id=user_id,
                error=str(exc),
                exc_info=True,
            )
