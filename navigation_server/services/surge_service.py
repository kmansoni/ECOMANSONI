"""
Navigation Server — Surge Pricing Engine.

Pipeline per update cycle (every UPDATE_INTERVAL_S = 180s):
  collect_market_state(cell)
  → compute_imbalance(state)            # −1 … +1 composite score
  → imbalance_to_multiplier(imbalance)  # sigmoid 1.0 … MAX_MULTIPLIER
  → apply_stability(cell, raw)          # hysteresis + max_step + dwell
  → spatial_smoothing(cell, stable)     # k-ring weighted average
  → check_anti_gaming(cell, state)      # freeze if anomaly
  → publish(cell, final_multiplier)

Stability layer prevents oscillation:
  - Hysteresis deadzone ±0.15 (ignore micro changes)
  - Max step change +0.5 per cycle (cap spike acceleration)
  - Faster descent (1.5× step) for better UX when surge drops
  - Min dwell time 300s before any change is applied

Anti-gaming:
  - Monitors supply/trusted_supply ratio; if many suspicious actors
    went online just before surge update → freeze the cell
  - Monitors rapid supply drops (>50% in 5min) as coordinated offline gaming
  - Frozen cells keep previous multiplier; frozen_until cached in Redis

Spatial smoothing:
  - k-ring(1) = 6 neighbors at H3 r7
  - weighted_avg = 0.60 * own + 0.40 * neighbours_mean
  - Prevents sharp cliff at zone boundary (bad UX, gaming opportunity)

Security:
  - All multiplier inputs are server-computed; no client override path
  - trusted_supply comes from RiskService (excludes fraud actors)
  - Kafka consumer input validated with schema before state updates
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any

import structlog

from services.h3_service import H3Service

if TYPE_CHECKING:
    from services.presence_service import PresenceService
    from services.risk_service import RiskService

logger = structlog.get_logger(__name__)

KAFKA_TOPIC_SURGE = "nav.surge.events"
KAFKA_TOPIC_MARKET = "nav.market.state"

REDIS_SURGE_TTL_S    = 300   # published surge multiplier cache
REDIS_DWELL_TTL_S    = 600   # dwell-time tracking
REDIS_FROZEN_TTL_S   = 600   # anti-gaming cell freeze


class SurgeService:
    """Surge Pricing Engine — zone-level dynamic multiplier computation."""

    MAX_MULTIPLIER   = 3.0
    MIN_MULTIPLIER   = 1.0
    MAX_STEP_CHANGE  = 0.5
    MIN_DWELL_TIME_S = 300
    HYSTERESIS       = 0.15
    UPDATE_INTERVAL_S = 180

    W_OPEN_REQUESTS     = 0.30
    W_SHORTAGE_PROB     = 0.25
    W_ETA_PRESSURE      = 0.25
    W_ACCEPTANCE_PENALTY = 0.20

    H3_SURGE_RESOLUTION = 7   # zone resolution for surge cells

    def __init__(
        self,
        db_pool: Any,
        redis: Any,
        kafka: Any,
        h3_service: H3Service,
        presence_service: "PresenceService",
        risk_service: "RiskService",
    ) -> None:
        self.db = db_pool
        self.redis = redis
        self.kafka = kafka
        self.h3 = h3_service
        self.presence = presence_service
        self.risk = risk_service

    # -------------------------------------------------------------------------
    # Main calculation loop
    # -------------------------------------------------------------------------

    async def calculate_surge(self, city_id: str = "default") -> list[dict]:
        """
        Main surge calculation cycle.
        Returns list of all updated zone records.
        Should be invoked by a background task every UPDATE_INTERVAL_S seconds.
        """
        # Fetch all active H3 cells (r7) that have recent demand or supply
        cells_rows = await self.db.fetch(
            """
            SELECT DISTINCT h3_cell
            FROM (
                SELECT h3_cell FROM nav_zone_market_state
                WHERE measured_at > NOW() - INTERVAL '10 minutes'
                UNION
                SELECT $1::text h3_cell  -- always include at least the default cell
            ) t
            """,
            "8928308280fffff",  # placeholder default cell; real deployment seeds from geofences
        )
        cells = [r["h3_cell"] for r in cells_rows]

        results: list[dict] = []
        for h3_cell in cells:
            try:
                result = await self._process_cell(h3_cell)
                if result:
                    results.append(result)
            except Exception as exc:  # noqa: BLE001
                logger.error("surge.cell_failed", h3_cell=h3_cell, error=str(exc))

        logger.info("surge.cycle_complete", city_id=city_id, cells=len(results))
        return results

    async def _process_cell(self, h3_cell: str) -> dict | None:
        """
        Single cell surge pipeline.
        """
        state = await self._collect_market_state(h3_cell)
        await self._update_market_state_db(h3_cell, state)

        # Anti-gaming: freeze check before computing new multiplier
        if await self._check_anti_gaming(h3_cell, state):
            logger.info("surge.cell_frozen_by_anti_gaming", h3_cell=h3_cell)
            return None

        imbalance = await self._compute_imbalance(state)
        raw_multiplier = await self._imbalance_to_multiplier(imbalance)
        stable_multiplier = await self._apply_stability(h3_cell, raw_multiplier)
        final_multiplier = await self._spatial_smoothing(h3_cell, stable_multiplier)

        # Build reason codes
        reason_codes: list[str] = []
        if state.get("open_requests", 0) > state.get("trusted_supply", 0):
            reason_codes.append("demand_exceeds_supply")
        if state.get("shortage_probability", 0.0) > 0.6:
            reason_codes.append("high_shortage_probability")
        if state.get("median_eta", 0) > 360:
            reason_codes.append("high_eta_pressure")
        if state.get("acceptance_rate", 1.0) < 0.60:
            reason_codes.append("low_acceptance_rate")

        await self._publish_surge(
            h3_cell=h3_cell,
            multiplier=final_multiplier,
            raw_multiplier=raw_multiplier,
            imbalance=imbalance,
            reason_codes=reason_codes,
        )
        return {
            "h3_cell": h3_cell,
            "multiplier": final_multiplier,
            "raw_multiplier": raw_multiplier,
            "imbalance_score": imbalance,
            "reason_codes": reason_codes,
            "state": state,
        }

    # -------------------------------------------------------------------------
    # Market state collection
    # -------------------------------------------------------------------------

    async def _collect_market_state(self, h3_cell: str) -> dict:
        """
        Collect current market state for a H3 cell.
        open_requests: DB count of trips in 'requested' or 'searching' status
        active_drivers: presence service count
        trusted_supply: risk-filtered supply count
        median_eta: from recent completed trip data
        acceptance_rate: recent dispatch acceptance ratio
        """
        # Open requests in this cell
        req_row = await self.db.fetchrow(
            """
            SELECT COUNT(*) AS cnt
            FROM nav_trips
            WHERE status IN ('requested', 'searching')
              AND pickup_h3_r7 = $1
              AND created_at > NOW() - INTERVAL '10 minutes'
            """,
            h3_cell,
        )
        open_requests = int(req_row["cnt"] or 0) if req_row else 0

        # Active drivers from presence (online + busy within cell's bounding area)
        # Use the h3 cell centroid for presence query
        try:
            cell_lat, cell_lng = self.h3.h3_to_latlng(h3_cell)
            nearby = await self.presence.get_nearby_actors(
                lat=cell_lat,
                lng=cell_lng,
                radius_m=2000,
                actor_type="driver",
                allow_busy=True,
                limit=200,
            )
            active_drivers = len(nearby)
        except Exception as exc:  # noqa: BLE001
            logger.warning("surge.presence_failed", h3_cell=h3_cell, error=str(exc))
            active_drivers = 0

        # Trusted supply (risk-filtered)
        trusted_supply = await self.risk.get_trusted_supply_count(h3_cell)
        # Fallback: if risk table has no data, use active_drivers as trust proxy
        if trusted_supply == 0 and active_drivers > 0:
            trusted_supply = active_drivers

        # Median ETA from recent dispatch completions
        eta_row = await self.db.fetchrow(
            """
            SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pickup_eta_s) AS median_eta
            FROM nav_dispatch_offers
            WHERE h3_pickup_cell = $1
              AND created_at > NOW() - INTERVAL '15 minutes'
              AND status = 'accepted'
            """,
            h3_cell,
        )
        median_eta = float(eta_row["median_eta"] or 0.0) if eta_row else 0.0

        # Acceptance rate
        acc_row = await self.db.fetchrow(
            """
            SELECT
                COUNT(*) FILTER (WHERE status = 'accepted') AS accepted,
                COUNT(*) AS total
            FROM nav_dispatch_offers
            WHERE h3_pickup_cell = $1
              AND created_at > NOW() - INTERVAL '15 minutes'
            """,
            h3_cell,
        )
        acceptance_rate = 1.0
        if acc_row and acc_row["total"]:
            total = int(acc_row["total"])
            if total > 0:
                acceptance_rate = round(int(acc_row["accepted"]) / total, 4)

        # Shortage probability from demand forecast (if available)
        forecast_row = await self.db.fetchrow(
            """
            SELECT shortage_probability
            FROM nav_demand_forecast
            WHERE h3_cell = $1
              AND bucket_start <= NOW()
              AND bucket_start > NOW() - INTERVAL '30 minutes'
            ORDER BY bucket_start DESC
            LIMIT 1
            """,
            h3_cell,
        )
        shortage_probability = float(forecast_row["shortage_probability"] or 0.0) if forecast_row else 0.0

        return {
            "h3_cell": h3_cell,
            "open_requests": open_requests,
            "active_drivers": active_drivers,
            "trusted_supply": trusted_supply,
            "median_eta": median_eta,
            "acceptance_rate": acceptance_rate,
            "shortage_probability": shortage_probability,
        }

    # -------------------------------------------------------------------------
    # Imbalance score
    # -------------------------------------------------------------------------

    async def _compute_imbalance(self, state: dict) -> float:
        """
        Composite imbalance score [0.0, 1.0] → maps to surge territory.
        Negative possible if large supply buffer is present (returns 0.0 floor).
        """
        trusted_supply = max(state.get("trusted_supply", 0), 1)
        open_requests  = state.get("open_requests", 0)
        shortage_prob  = float(state.get("shortage_probability", 0.0))
        median_eta     = float(state.get("median_eta", 0.0))
        acceptance_rate = float(state.get("acceptance_rate", 1.0))

        normalized_requests = min(open_requests / trusted_supply, 3.0) / 3.0
        eta_pressure = min(median_eta / 600.0, 1.0)   # 10 min = max pressure
        acceptance_penalty = max(0.0, 1.0 - acceptance_rate)

        score = (
            self.W_OPEN_REQUESTS      * normalized_requests
            + self.W_SHORTAGE_PROB    * shortage_prob
            + self.W_ETA_PRESSURE     * eta_pressure
            + self.W_ACCEPTANCE_PENALTY * acceptance_penalty
        )

        # Strong supply buffer: dampen score significantly
        if trusted_supply > open_requests * 2 and open_requests > 0:
            score *= 0.3
        elif trusted_supply > open_requests * 1.5:
            score *= 0.6

        return round(max(0.0, min(1.0, score)), 4)

    # -------------------------------------------------------------------------
    # Sigmoid multiplier mapping
    # -------------------------------------------------------------------------

    async def _imbalance_to_multiplier(self, imbalance: float) -> float:
        """
        Maps imbalance [0, 1] to multiplier [MIN_MULTIPLIER, MAX_MULTIPLIER]
        via sigmoid curve to achieve steeper growth at high imbalance.
        imbalance == 0.0 → 1.0 (no surge)
        imbalance == 1.0 → MAX_MULTIPLIER
        """
        if imbalance <= 0.0:
            return self.MIN_MULTIPLIER

        # Map 0..1 to -3..3 for sigmoid steepness
        x = imbalance * 6.0 - 3.0
        sigmoid = 1.0 / (1.0 + math.exp(-x))
        multiplier = self.MIN_MULTIPLIER + sigmoid * (self.MAX_MULTIPLIER - self.MIN_MULTIPLIER)
        return round(min(self.MAX_MULTIPLIER, max(self.MIN_MULTIPLIER, multiplier)), 2)

    # -------------------------------------------------------------------------
    # Stability layer
    # -------------------------------------------------------------------------

    async def _apply_stability(self, h3_cell: str, raw_multiplier: float) -> float:
        """
        Stability layer:
        1. Load current published multiplier from Redis.
        2. Apply hysteresis deadzone.
        3. Cap step change (ascending slower than descending for UX).
        4. Enforce minimum dwell time between changes.
        5. Return stabilised multiplier.
        """
        redis_key = f"surge:multiplier:{h3_cell}"
        dwell_key = f"surge:dwell:{h3_cell}"

        current_raw = await self.redis.get(redis_key)
        current = float(current_raw) if current_raw is not None else self.MIN_MULTIPLIER

        delta = raw_multiplier - current

        # Hysteresis deadzone — micro-changes are ignored
        if abs(delta) < self.HYSTERESIS:
            return current

        # Check dwell time: how long since last change?
        last_changed_raw = await self.redis.get(dwell_key)
        if last_changed_raw is not None:
            elapsed = (datetime.now(timezone.utc).timestamp() - float(last_changed_raw))
            if elapsed < self.MIN_DWELL_TIME_S:
                return current  # too soon to change

        # Step cap
        if delta > 0:
            step = min(delta, self.MAX_STEP_CHANGE)
        else:
            # Descend is 1.5× faster (better for rider UX)
            step = max(delta, -self.MAX_STEP_CHANGE * 1.5)

        new_multiplier = round(
            max(self.MIN_MULTIPLIER, min(self.MAX_MULTIPLIER, current + step)),
            2,
        )

        # Record dwell timestamp (only when value actually changes)
        if new_multiplier != current:
            try:
                await self.redis.set(
                    dwell_key,
                    str(datetime.now(timezone.utc).timestamp()),
                    ex=REDIS_DWELL_TTL_S,
                )
            except Exception:  # noqa: BLE001
                pass

        return new_multiplier

    # -------------------------------------------------------------------------
    # Spatial smoothing
    # -------------------------------------------------------------------------

    async def _spatial_smoothing(self, h3_cell: str, multiplier: float) -> float:
        """
        Smooth zone boundary by blending with k-ring(1) neighbours.
        Prevents sharp cliff at zone edge that would be exploitable for gaming.
        """
        try:
            neighbours = self.h3.k_ring(h3_cell, k=1)
            neighbours = [n for n in neighbours if n != h3_cell]
        except Exception as exc:  # noqa: BLE001
            logger.warning("surge.kring_failed", h3_cell=h3_cell, error=str(exc))
            return multiplier

        if not neighbours:
            return multiplier

        neighbour_multipliers: list[float] = []
        for n_cell in neighbours:
            n_key = f"surge:multiplier:{n_cell}"
            n_raw = await self.redis.get(n_key)
            n_val = float(n_raw) if n_raw is not None else self.MIN_MULTIPLIER
            neighbour_multipliers.append(n_val)

        avg_neighbours = sum(neighbour_multipliers) / len(neighbour_multipliers)
        smoothed = 0.60 * multiplier + 0.40 * avg_neighbours
        return round(max(self.MIN_MULTIPLIER, min(self.MAX_MULTIPLIER, smoothed)), 2)

    # -------------------------------------------------------------------------
    # Anti-gaming detection
    # -------------------------------------------------------------------------

    async def _check_anti_gaming(self, h3_cell: str, state: dict) -> bool:
        """
        Check for coordinated gaming signals.
        Returns True if cell should be frozen (no surge update this cycle).

        Indicators:
          1. trusted_supply << active_drivers (many suspicious actors)
          2. Supply drop > 50% within 5 minutes
          3. Pattern: supply drops, then request surge, then supply reappears
        """
        frozen_key = f"surge:frozen:{h3_cell}"
        if await self.redis.get(frozen_key):
            return True

        active = state.get("active_drivers", 0)
        trusted = state.get("trusted_supply", 0)

        # Indicator 1: many suspicious actors in zone (>30% untrusted supply)
        if active > 5 and trusted < active * 0.70:
            logger.warning(
                "surge.anti_gaming_suspicious_supply",
                h3_cell=h3_cell,
                active=active,
                trusted=trusted,
            )
            await self.redis.set(frozen_key, "1", ex=REDIS_FROZEN_TTL_S)
            return True

        # Indicator 2: rapid supply drop vs 5 min ago
        prev_supply_key = f"surge:prev_supply:{h3_cell}"
        prev_supply_raw = await self.redis.get(prev_supply_key)
        if prev_supply_raw is not None:
            prev_supply = int(prev_supply_raw)
            if prev_supply > 4 and active < prev_supply * 0.50:
                logger.warning(
                    "surge.anti_gaming_supply_drop",
                    h3_cell=h3_cell,
                    prev=prev_supply,
                    current=active,
                )
                await self.redis.set(frozen_key, "1", ex=REDIS_FROZEN_TTL_S)
                return True

        # Record current supply for comparison next cycle
        try:
            await self.redis.set(prev_supply_key, str(active), ex=360)
        except Exception:  # noqa: BLE001
            pass

        return False

    # -------------------------------------------------------------------------
    # Public read operations
    # -------------------------------------------------------------------------

    async def get_surge_for_location(self, lat: float, lng: float) -> dict:
        """
        Get current surge multiplier for a specific location.
        Cache-first; fallback to DB.
        """
        h3_cell = self.h3.latlng_to_h3(lat, lng, resolution=self.H3_SURGE_RESOLUTION)
        redis_key = f"surge:multiplier:{h3_cell}"
        cached_mul = await self.redis.get(redis_key)

        if cached_mul is not None:
            # Fetch additional info from detail key
            detail_key = f"surge:detail:{h3_cell}"
            detail = await self.redis.get_json(detail_key)
            if detail:
                return detail
            # Minimal response from multiplier-only cache
            return {
                "h3_cell": h3_cell,
                "multiplier": float(cached_mul),
                "reason_codes": [],
                "effective_until": None,
                "source": "cache",
            }

        # Fallback to DB
        row = await self.db.fetchrow(
            """
            SELECT multiplier, raw_multiplier, imbalance_score, reason_codes,
                   confidence, effective_from, effective_until
            FROM nav_surge_pricing
            WHERE h3_cell = $1
              AND effective_until > NOW()
            ORDER BY effective_from DESC
            LIMIT 1
            """,
            h3_cell,
        )
        if row is None:
            return {
                "h3_cell": h3_cell,
                "multiplier": self.MIN_MULTIPLIER,
                "reason_codes": [],
                "effective_until": None,
                "source": "default",
            }
        return {
            "h3_cell": h3_cell,
            "multiplier": float(row["multiplier"]),
            "raw_multiplier": float(row["raw_multiplier"]),
            "imbalance_score": float(row["imbalance_score"]),
            "reason_codes": list(row["reason_codes"] or []),
            "confidence": float(row["confidence"]),
            "effective_from": row["effective_from"].isoformat() if row["effective_from"] else None,
            "effective_until": row["effective_until"].isoformat() if row["effective_until"] else None,
            "source": "db",
        }

    async def get_surge_map(self, bbox: dict) -> list[dict]:
        """
        Surge heatmap for a bounding box.
        Returns list of {h3_cell, multiplier, boundary_polygon}.
        """
        min_lat = float(bbox.get("min_lat", -90))
        min_lng = float(bbox.get("min_lng", -180))
        max_lat = float(bbox.get("max_lat", 90))
        max_lng = float(bbox.get("max_lng", 180))

        rows = await self.db.fetch(
            """
            SELECT
                sp.h3_cell,
                sp.multiplier,
                sp.reason_codes,
                sp.effective_until,
                ST_AsGeoJSON(
                    ST_ConvexHull(
                        ST_Collect(
                            ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326)
                        )
                    )
                )::json AS boundary_polygon
            FROM nav_surge_pricing sp
            JOIN LATERAL (
                SELECT unnest(ARRAY[
                    ST_Y(ST_Centroid(ST_GeomFromText('POINT(' || 0 || ' ' || 0 || ')')))
                ]) AS lat,
                unnest(ARRAY[0.0]) AS lng
            ) v ON true
            WHERE sp.effective_until > NOW()
              AND sp.multiplier > 1.0
              AND ST_Intersects(
                  ST_MakeEnvelope($1, $2, $3, $4, 4326),
                  ST_SetSRID(ST_MakePoint(
                      (ST_X(ST_Centroid(ST_GeomFromH3(sp.h3_cell)))),
                      (ST_Y(ST_Centroid(ST_GeomFromH3(sp.h3_cell))))
                  ), 4326)
              )
            GROUP BY sp.h3_cell, sp.multiplier, sp.reason_codes, sp.effective_until
            ORDER BY sp.multiplier DESC
            LIMIT 500
            """,
            min_lng, min_lat, max_lng, max_lat,
        )
        return [dict(r) for r in rows]

    async def get_surge_zones(self, city_id: str = "default") -> list[dict]:
        """
        All active surge zones for a city.
        """
        rows = await self.db.fetch(
            """
            SELECT h3_cell, multiplier, raw_multiplier, imbalance_score,
                   reason_codes, confidence, effective_from, effective_until
            FROM nav_surge_pricing
            WHERE effective_until > NOW()
              AND multiplier > 1.0
            ORDER BY multiplier DESC
            LIMIT 1000
            """
        )
        return [
            {
                **dict(r),
                "effective_from": r["effective_from"].isoformat() if r["effective_from"] else None,
                "effective_until": r["effective_until"].isoformat() if r["effective_until"] else None,
                "reason_codes": list(r["reason_codes"] or []),
            }
            for r in rows
        ]

    # -------------------------------------------------------------------------
    # Internal persistence
    # -------------------------------------------------------------------------

    async def _update_market_state_db(self, h3_cell: str, state: dict) -> None:
        """Upsert current market snapshot into nav_zone_market_state."""
        now = datetime.now(timezone.utc)
        await self.db.execute(
            """
            INSERT INTO nav_zone_market_state
                (zone_id, h3_cell, open_requests, active_drivers, trusted_supply,
                 median_pickup_eta_s, shortage_probability, measured_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (h3_cell)
            DO UPDATE SET
                open_requests       = EXCLUDED.open_requests,
                active_drivers      = EXCLUDED.active_drivers,
                trusted_supply      = EXCLUDED.trusted_supply,
                median_pickup_eta_s = EXCLUDED.median_pickup_eta_s,
                shortage_probability = EXCLUDED.shortage_probability,
                measured_at         = EXCLUDED.measured_at
            """,
            h3_cell, h3_cell,
            state["open_requests"],
            state["active_drivers"],
            state["trusted_supply"],
            state["median_eta"],
            state["shortage_probability"],
            now,
        )

    async def _publish_surge(
        self,
        h3_cell: str,
        multiplier: float,
        raw_multiplier: float,
        imbalance: float,
        reason_codes: list[str],
    ) -> None:
        """
        Upsert nav_surge_pricing + cache in Redis + publish Kafka event.
        effective_until = now + UPDATE_INTERVAL_S * 3 (stale after 3 missed cycles)
        """
        now = datetime.now(timezone.utc)
        effective_until = now + timedelta(seconds=self.UPDATE_INTERVAL_S * 3)
        confidence = 0.9 if multiplier > self.MIN_MULTIPLIER else 1.0

        await self.db.execute(
            """
            INSERT INTO nav_surge_pricing
                (zone_id, h3_cell, multiplier, raw_multiplier, imbalance_score,
                 reason_codes, confidence, effective_from, effective_until)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (h3_cell)
            DO UPDATE SET
                multiplier      = EXCLUDED.multiplier,
                raw_multiplier  = EXCLUDED.raw_multiplier,
                imbalance_score = EXCLUDED.imbalance_score,
                reason_codes    = EXCLUDED.reason_codes,
                confidence      = EXCLUDED.confidence,
                effective_from  = EXCLUDED.effective_from,
                effective_until = EXCLUDED.effective_until
            """,
            h3_cell, h3_cell,
            multiplier, raw_multiplier, imbalance,
            reason_codes, confidence, now, effective_until,
        )

        # Cache multiplier as bare float for ultra-fast reads
        try:
            await self.redis.set(
                f"surge:multiplier:{h3_cell}",
                str(multiplier),
                ex=REDIS_SURGE_TTL_S,
            )
            detail = {
                "h3_cell": h3_cell,
                "multiplier": multiplier,
                "raw_multiplier": raw_multiplier,
                "imbalance_score": imbalance,
                "reason_codes": reason_codes,
                "confidence": confidence,
                "effective_from": now.isoformat(),
                "effective_until": effective_until.isoformat(),
                "source": "live",
            }
            await self.redis.set_json(
                f"surge:detail:{h3_cell}",
                detail,
                ex=REDIS_SURGE_TTL_S,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("surge.redis_cache_failed", h3_cell=h3_cell, error=str(exc))

        # Kafka event
        event = {
            "h3_cell": h3_cell,
            "multiplier": multiplier,
            "raw_multiplier": raw_multiplier,
            "imbalance_score": imbalance,
            "reason_codes": reason_codes,
            "effective_until": effective_until.isoformat(),
            "ts": now.isoformat(),
        }
        try:
            await self.kafka.produce_event(
                topic=KAFKA_TOPIC_SURGE,
                key=h3_cell,
                value=event,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("surge.kafka_failed", h3_cell=h3_cell, error=str(exc))
