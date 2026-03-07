"""
Navigation Server — Presence Engine.

Responsibility:
  - Maintain actor online/offline state in Redis (TTL-based liveness)
  - Expose GEOSEARCH-backed nearby queries
  - Publish state-change events to Kafka nav.presence.changes

State machine per actor:
  OFFLINE ──[first_update]──► ONLINE
  ONLINE  ──[TTL expires]───► OFFLINE  (Redis handles expiry)
  ONLINE  ──[set_availability(offline)]──► OFFLINE (explicit)
  ONLINE  ──[set_availability(busy)]──► BUSY
  BUSY    ──[set_availability(online)]──► ONLINE

Presence key schema (Redis JSON):
  presence:{actor_type}:{actor_id} →
    {lat, lng, ts, accuracy_m, heading_deg, speed_mps, h3_r9, availability, session_id}

GEO index:
  geo:{city}:{actor_type}s  →  Redis Sorted Set with GEOADD scores

Security notes:
  - actor_id is always validated by caller (comes from JWT sub, never from client body)
  - SCAN is paginated to avoid blocking Redis on large keyspaces
  - GEOSEARCH radius cap enforced at 50 km to prevent range-scan abuse
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

import structlog

from services.h3_service import H3Service

logger = structlog.get_logger(__name__)

PRESENCE_TTL_S = 30             # Redis key TTL in seconds
OFFLINE_THRESHOLD_S = 20        # Seconds without update → consider offline
MAX_GEOSEARCH_RADIUS_M = 50_000 # Hard cap on nearby search radius

KAFKA_TOPIC_PRESENCE = "nav.presence.changes"

VALID_AVAILABILITY = frozenset({"online", "busy", "offline"})


class PresenceService:
    """Presence Engine — tracks who is online and where."""

    def __init__(
        self,
        redis: Any,
        kafka_producer: Any,
        h3_service: H3Service,
    ) -> None:
        self.redis = redis
        self.kafka = kafka_producer
        self.h3 = h3_service

    # -------------------------------------------------------------------------
    # Core presence operations
    # -------------------------------------------------------------------------

    async def update_presence(
        self,
        actor_id: str,
        actor_type: str,
        lat: float,
        lng: float,
        availability: str = "online",
        extra: dict | None = None,
    ) -> dict:
        """
        Set or refresh presence for an actor.

        1. Read existing presence to detect state transition
        2. Build new presence payload
        3. SET presence:{actor_type}:{actor_id} with TTL
        4. If availability changed (offline → online, or reversed) → Kafka event
        5. Return presence data
        """
        key = f"presence:{actor_type}:{actor_id}"
        now_iso = datetime.now(timezone.utc).isoformat()

        previous = await self.redis.get_json(key)
        previous_availability = previous.get("availability") if previous else None

        h3_index = self.h3.latlng_to_h3(lat, lng, resolution=9)

        presence_data: dict = {
            "actor_id": actor_id,
            "actor_type": actor_type,
            "lat": lat,
            "lng": lng,
            "ts": now_iso,
            "h3_r9": h3_index,
            "availability": availability,
        }
        if extra:
            # Merge extra fields (accuracy, heading, speed, session_id …)
            presence_data.update(
                {k: v for k, v in extra.items() if v is not None}
            )

        await self.redis.set_json(key, presence_data, ex=PRESENCE_TTL_S)

        # Detect meaningful state transitions and publish to Kafka
        state_changed = (
            previous is None  # first appearance
            or previous_availability != availability
        )
        if state_changed:
            event = {
                "actor_id": actor_id,
                "actor_type": actor_type,
                "previous_availability": previous_availability,
                "availability": availability,
                "lat": lat,
                "lng": lng,
                "ts": now_iso,
            }
            try:
                await self.kafka.produce_event(
                    topic=KAFKA_TOPIC_PRESENCE,
                    key=actor_id,
                    value=event,
                )
            except Exception as exc:  # noqa: BLE001
                # Kafka publish failure must not block the ingest pipeline
                logger.error(
                    "presence.kafka_publish_failed",
                    actor_id=actor_id,
                    error=str(exc),
                )

            logger.info(
                "presence.state_changed",
                actor_id=actor_id,
                actor_type=actor_type,
                from_state=previous_availability,
                to_state=availability,
            )

        return presence_data

    async def get_presence(
        self, actor_id: str, actor_type: str = "driver"
    ) -> dict | None:
        """
        Retrieve current presence from Redis.
        Returns None if actor is offline (key expired or never set).
        """
        key = f"presence:{actor_type}:{actor_id}"
        data = await self.redis.get_json(key)
        if data is None:
            return None

        # Check soft offline threshold — key may still exist but update is stale
        ts_raw = data.get("ts")
        if ts_raw:
            try:
                last_update = datetime.fromisoformat(ts_raw)
                if last_update.tzinfo is None:
                    last_update = last_update.replace(tzinfo=timezone.utc)
                age_s = (datetime.now(timezone.utc) - last_update).total_seconds()
                if age_s > OFFLINE_THRESHOLD_S:
                    data["availability"] = "offline"
                    data["stale"] = True
            except (ValueError, TypeError):
                pass

        return data

    async def set_availability(
        self, actor_id: str, actor_type: str, availability: str
    ) -> dict:
        """
        Explicit availability toggle (e.g. driver goes on/off duty).
        Validates the availability value, patches existing presence, re-publishes.

        If no existing presence key is found (actor is offline), availability is
        set to 'offline' regardless of requested value to avoid ghost presences.
        """
        if availability not in VALID_AVAILABILITY:
            from exceptions import ValidationError  # type: ignore[import]
            raise ValidationError(
                f"Invalid availability value: {availability!r}",
                detail={"valid": list(VALID_AVAILABILITY)},
            )

        key = f"presence:{actor_type}:{actor_id}"
        existing = await self.redis.get_json(key)

        if existing is None:
            if availability == "offline":
                # Already offline, nothing to do
                return {"actor_id": actor_id, "availability": "offline", "changed": False}
            # Actor has no presence yet — cannot go online without a location update
            from exceptions import ValidationError  # type: ignore[import]
            raise ValidationError(
                "Cannot set availability without an active presence. "
                "Send a location update first.",
                detail={"actor_id": actor_id},
            )

        previous = existing.get("availability")
        if previous == availability:
            return {**existing, "changed": False}

        existing["availability"] = availability
        existing["ts"] = datetime.now(timezone.utc).isoformat()

        # If going offline → delete key immediately (don't wait for TTL)
        if availability == "offline":
            await self.redis.delete(key)
            # Also remove from GEO index
            city_id = "default"
            geo_key = f"geo:{city_id}:{actor_type}s"
            await self.redis.geo_remove(geo_key, actor_id)
        else:
            await self.redis.set_json(key, existing, ex=PRESENCE_TTL_S)

        event = {
            "actor_id": actor_id,
            "actor_type": actor_type,
            "previous_availability": previous,
            "availability": availability,
            "ts": existing["ts"],
        }
        try:
            await self.kafka.produce_event(
                topic=KAFKA_TOPIC_PRESENCE,
                key=actor_id,
                value=event,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "presence.kafka_publish_failed",
                actor_id=actor_id,
                error=str(exc),
            )

        logger.info(
            "presence.availability_changed",
            actor_id=actor_id,
            actor_type=actor_type,
            from_state=previous,
            to_state=availability,
        )
        return {**existing, "changed": True}

    async def get_online_count(
        self, actor_type: str = "driver", city_id: str = "default"
    ) -> int:
        """
        Count online actors via Redis ZCARD on the GEO sorted set.
        GEO sets are pruned lazily (stale actors remain until presence TTL drives
        cleanup_stale). This count is therefore approximate but O(1).
        """
        geo_key = f"geo:{city_id}:{actor_type}s"
        count = await self.redis.zcard(geo_key)
        return count

    async def get_nearby_actors(
        self,
        lat: float,
        lng: float,
        radius_m: float,
        actor_type: str = "driver",
        vehicle_class: str | None = None,
        limit: int = 20,
        city_id: str = "default",
        allow_busy: bool = False,
    ) -> list[dict]:
        """
        Find nearby actors using Redis GEOSEARCH.

        1. Cap radius at MAX_GEOSEARCH_RADIUS_M
        2. GEOSEARCH geo:{city}:{actor_type}s FROMLONLAT lng lat BYRADIUS radius_m m ASC COUNT limit*3
        3. MGET presence keys for all candidates in one pipeline
        4. Filter: online (or also busy if allow_busy)
        5. Filter: vehicle_class if specified
        6. Return top `limit` by distance
        """
        radius_m = min(radius_m, MAX_GEOSEARCH_RADIUS_M)
        geo_key = f"geo:{city_id}:{actor_type}s"

        # Over-fetch to compensate for filtering; cap at 3x limit
        raw_results = await self.redis.geo_search(
            geo_key,
            lng=lng,
            lat=lat,
            radius_m=radius_m,
            count=limit * 3,
            asc=True,
            with_dist=True,
            with_coord=True,
        )
        # raw_results: list of (actor_id, distance_m, (geo_lng, geo_lat))
        if not raw_results:
            return []

        # Build presence key list for pipeline fetch
        presence_keys = [
            f"presence:{actor_type}:{item[0]}" for item in raw_results
        ]
        presence_list = await self.redis.mget_json(presence_keys)

        output: list[dict] = []
        for (actor_id, distance_m, coords), presence in zip(raw_results, presence_list):
            if presence is None:
                # Stale GEO entry — actor's presence key expired
                continue

            actor_availability = presence.get("availability", "offline")
            if actor_availability == "offline":
                continue
            if not allow_busy and actor_availability == "busy":
                continue

            if vehicle_class is not None:
                if presence.get("vehicle_class") != vehicle_class:
                    continue

            # Check soft staleness
            ts_raw = presence.get("ts")
            stale = False
            if ts_raw:
                try:
                    last_update = datetime.fromisoformat(ts_raw)
                    if last_update.tzinfo is None:
                        last_update = last_update.replace(tzinfo=timezone.utc)
                    age_s = (datetime.now(timezone.utc) - last_update).total_seconds()
                    stale = age_s > OFFLINE_THRESHOLD_S
                except (ValueError, TypeError):
                    pass

            if stale:
                continue

            output.append({
                "actor_id": actor_id,
                "actor_type": actor_type,
                "lat": presence.get("lat", coords[1]),
                "lng": presence.get("lng", coords[0]),
                "distance_m": round(distance_m),
                "availability": actor_availability,
                "heading_deg": presence.get("heading_deg"),
                "speed_mps": presence.get("speed_mps"),
                "h3_r9": presence.get("h3_r9"),
                "last_seen_ts": presence.get("ts"),
            })

            if len(output) >= limit:
                break

        return output

    async def remove_presence(self, actor_id: str, actor_type: str) -> None:
        """
        Hard-remove presence on explicit logout.
        Deletes Redis key and removes from GEO sorted set.
        Publishes offline event to Kafka.
        """
        key = f"presence:{actor_type}:{actor_id}"
        existing = await self.redis.get_json(key)

        await self.redis.delete(key)

        city_id = "default"
        geo_key = f"geo:{city_id}:{actor_type}s"
        await self.redis.geo_remove(geo_key, actor_id)

        if existing is not None:
            event = {
                "actor_id": actor_id,
                "actor_type": actor_type,
                "previous_availability": existing.get("availability"),
                "availability": "offline",
                "reason": "explicit_logout",
                "ts": datetime.now(timezone.utc).isoformat(),
            }
            try:
                await self.kafka.produce_event(
                    topic=KAFKA_TOPIC_PRESENCE,
                    key=actor_id,
                    value=event,
                )
            except Exception as exc:  # noqa: BLE001
                logger.error("presence.kafka_publish_failed", actor_id=actor_id, error=str(exc))

        logger.info("presence.removed", actor_id=actor_id, actor_type=actor_type)

    async def cleanup_stale(self, city_id: str = "default") -> int:
        """
        Periodic maintenance job: scan GEO sorted sets and remove members whose
        presence key has expired from Redis.

        Redis TTL automatically deletes the presence key; but the GEO sorted set
        entry persists until explicitly removed. This job reconciles the two.

        Returns the number of stale members removed.
        Called by a background task every 60 seconds.
        Uses ZSCAN to iterate without blocking Redis.
        """
        removed_total = 0

        for actor_type in ("driver", "vehicle", "user"):
            geo_key = f"geo:{city_id}:{actor_type}s"
            stale_members: list[str] = []

            cursor = 0
            while True:
                cursor, members = await self.redis.zscan(geo_key, cursor=cursor, count=200)
                # members is list of (member, score)
                for member, _ in members:
                    presence_key = f"presence:{actor_type}:{member}"
                    exists = await self.redis.exists(presence_key)
                    if not exists:
                        stale_members.append(member)

                if cursor == 0:
                    break

            if stale_members:
                await self.redis.geo_remove_multi(geo_key, stale_members)
                removed_total += len(stale_members)
                logger.info(
                    "presence.stale_cleaned",
                    geo_key=geo_key,
                    removed=len(stale_members),
                )

        return removed_total
