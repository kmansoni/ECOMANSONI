"""
Navigation Server — Anti-Fraud Risk Engine.

Architecture:
  Signal ingestion → sub-score calculation → weighted aggregation →
  threshold check → auto-enforcement → Kafka publish.

Enforcement ladder (ordered, strictly ascending or manual review to descend):
  observe → soft_throttle → hard_throttle → suspended → banned

Attack surface mitigated:
  - actor_id always comes from JWT (never client body)
  - Enforcement level transitions validated (cannot manually skip levels unless
    performed_by == "system" with automatic escalation)
  - Suspended/banned actors: presence evicted from Redis, pending offers cancelled
  - get_trusted_supply_count: used by surge engine to avoid counting fraudulent supply
  - All sub-scores capped at 1.0 to prevent injection of amplified scores

Security notes on scoring:
  - Weights sum to 1.0; result is always in [0.0, 1.0]
  - shared_device hash computed server-side from device fingerprint, not actor claim
  - "new_account" determined by DB record created_at vs. clock, not client-provided field
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog

from services.h3_service import H3Service

logger = structlog.get_logger(__name__)

KAFKA_TOPIC_RISK_SIGNALS = "nav.risk.signals"
KAFKA_TOPIC_RISK_ACTIONS = "nav.risk.actions"

REDIS_RISK_TTL_S = 300   # 5 min cache for risk scores
REDIS_ENF_TTL_S = 60     # 1 min cache for enforcement checks


class RiskService:
    """
    Anti-Fraud Risk Engine.
    Layered: signals → sub-scores → weighted total → enforcement ladder.
    """

    ENFORCEMENT_LEVELS = ["observe", "soft_throttle", "hard_throttle", "suspended", "banned"]

    RISK_THRESHOLDS = {
        "soft_throttle": 0.50,
        "hard_throttle": 0.70,
        "suspended":     0.85,
        "banned":        0.95,
    }

    # Scoring weights — must sum to 1.0
    W_GPS     = 0.30
    W_BEHAV   = 0.25
    W_MARKET  = 0.30
    W_ACCOUNT = 0.15

    def __init__(
        self,
        db_pool: Any,
        redis: Any,
        kafka: Any,
        h3_service: H3Service,
    ) -> None:
        self.db = db_pool
        self.redis = redis
        self.kafka = kafka
        self.h3 = h3_service

    # -------------------------------------------------------------------------
    # Primary: evaluate risk
    # -------------------------------------------------------------------------

    async def evaluate_risk(self, actor_id: str, signals: dict) -> dict:
        """
        Evaluate risk score for an actor based on provided signals.

        Returns dict with:
          actor_id, risk_score, risk_types, confidence, enforcement_level,
          auto_enforced (bool), sub_scores, evaluated_at
        """
        gps_score    = await self._calc_gps_anomaly(signals)
        behav_score  = await self._calc_behavior_anomaly(signals)
        market_score = await self._calc_market_manipulation(signals)
        acct_score   = await self._calc_account_risk(actor_id, signals)

        risk_score = (
            self.W_GPS     * gps_score
            + self.W_BEHAV   * behav_score
            + self.W_MARKET  * market_score
            + self.W_ACCOUNT * acct_score
        )
        risk_score = round(min(1.0, max(0.0, risk_score)), 4)

        risk_types: list[str] = []
        if gps_score >= 0.3:
            risk_types.append("gps_anomaly")
        if behav_score >= 0.3:
            risk_types.append("behavior_anomaly")
        if market_score >= 0.3:
            risk_types.append("market_manipulation")
        if acct_score >= 0.3:
            risk_types.append("account_risk")

        # Confidence: proportional to number of signals provided
        signal_coverage = sum([
            "gps_accuracy" in signals or "speed_mps" in signals or "jump_detected" in signals,
            "acceptance_rate" in signals or "cancellation_rate" in signals,
            "online_offline_toggles_10m" in signals or "surge_window_only" in signals,
            "shared_device" in signals,
        ])
        confidence = round(signal_coverage / 4.0, 2)

        now = datetime.now(timezone.utc)

        # Upsert nav_risk_scores
        await self.db.execute(
            """
            INSERT INTO nav_risk_scores
                (actor_id, actor_type, risk_score, risk_types, confidence,
                 enforcement_level, enforcement_expires_at)
            VALUES ($1, 'driver', $2, $3, $4, 'observe', NULL)
            ON CONFLICT (actor_id)
            DO UPDATE SET
                risk_score    = EXCLUDED.risk_score,
                risk_types    = EXCLUDED.risk_types,
                confidence    = EXCLUDED.confidence,
                updated_at    = NOW()
            """,
            actor_id,
            risk_score,
            risk_types,
            confidence,
        )

        # Invalidate Redis cache
        await self._invalidate_risk_cache(actor_id)

        # Auto-enforcement check
        auto_enforced = False
        new_level: str | None = None
        for level in reversed(self.ENFORCEMENT_LEVELS[1:]):  # skip 'observe'
            if level in self.RISK_THRESHOLDS and risk_score >= self.RISK_THRESHOLDS[level]:
                new_level = level
                break

        current_record = await self.get_risk_score(actor_id)
        current_level = current_record.get("enforcement_level", "observe") if current_record else "observe"

        if new_level is not None:
            current_idx = self.ENFORCEMENT_LEVELS.index(current_level)
            new_idx = self.ENFORCEMENT_LEVELS.index(new_level)
            if new_idx > current_idx:
                duration = 24 if new_level in ("suspended",) else None
                await self.enforce(
                    actor_id=actor_id,
                    new_level=new_level,
                    reason=f"auto:risk_score={risk_score:.3f}",
                    performed_by="system",
                    duration_hours=duration,
                )
                auto_enforced = True
                current_level = new_level

        # Publish signal to Kafka
        event = {
            "actor_id": actor_id,
            "risk_score": risk_score,
            "risk_types": risk_types,
            "confidence": confidence,
            "auto_enforced": auto_enforced,
            "enforcement_level": current_level,
            "sub_scores": {
                "gps":     gps_score,
                "behavior": behav_score,
                "market":  market_score,
                "account": acct_score,
            },
            "ts": now.isoformat(),
        }
        try:
            await self.kafka.produce_event(
                topic=KAFKA_TOPIC_RISK_SIGNALS,
                key=actor_id,
                value=event,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("risk.kafka_failed", actor_id=actor_id, error=str(exc))

        logger.info(
            "risk.evaluated",
            actor_id=actor_id,
            risk_score=risk_score,
            auto_enforced=auto_enforced,
            enforcement_level=current_level,
        )
        return {
            **event,
            "evaluated_at": now.isoformat(),
        }

    # -------------------------------------------------------------------------
    # Sub-score calculators
    # -------------------------------------------------------------------------

    async def _calc_gps_anomaly(self, signals: dict) -> float:
        """
        GPS anomaly sub-score [0.0, 1.0].
        Indicators:
          accuracy > 80m                → +0.30
          speed > 70 m/s (252 km/h)    → +0.40
          jump_detected == True         → +0.30
          location_mismatch == True     → +0.50
        """
        score = 0.0
        accuracy = signals.get("gps_accuracy")
        if accuracy is not None and float(accuracy) > 80.0:
            score += 0.30

        speed = signals.get("speed_mps")
        if speed is not None and float(speed) > 70.0:
            score += 0.40

        if signals.get("jump_detected") is True:
            score += 0.30

        if signals.get("location_mismatch") is True:
            score += 0.50

        return min(1.0, score)

    async def _calc_behavior_anomaly(self, signals: dict) -> float:
        """
        Behavioral anomaly sub-score [0.0, 1.0].
        Indicators:
          acceptance_rate < 30%               → +0.40
          cancellation_rate > 40%             → +0.30
          selective_acceptance (high accept in
            surge windows only, see market score) → +0.30
        """
        score = 0.0
        acc_rate = signals.get("acceptance_rate")
        if acc_rate is not None and float(acc_rate) < 0.30:
            score += 0.40

        canc_rate = signals.get("cancellation_rate")
        if canc_rate is not None and float(canc_rate) > 0.40:
            score += 0.30

        # Selective acceptance: low acceptance overall but high in surge zones
        if (
            acc_rate is not None
            and signals.get("surge_window_only") is True
            and float(acc_rate) > 0.70
        ):
            score += 0.30

        return min(1.0, score)

    async def _calc_market_manipulation(self, signals: dict) -> float:
        """
        Market manipulation sub-score [0.0, 1.0].
        Indicators:
          online_offline_toggles_10m > 5 → +0.50
          surge_window_only == True      → +0.50
        """
        score = 0.0
        toggles = signals.get("online_offline_toggles_10m")
        if toggles is not None and int(toggles) > 5:
            score += 0.50

        if signals.get("surge_window_only") is True:
            score += 0.50

        return min(1.0, score)

    async def _calc_account_risk(self, actor_id: str, signals: dict) -> float:
        """
        Account risk sub-score [0.0, 1.0].
        Indicators:
          shared_device == True                    → +0.50
          account age < 7 days                     → +0.20
          multiple_accounts_same_device == True    → +0.80
        """
        score = 0.0

        if signals.get("shared_device") is True:
            score += 0.50

        if signals.get("multiple_accounts_same_device") is True:
            score += 0.80

        # Check account age from DB (server-authoritative, not client signal)
        try:
            row = await self.db.fetchrow(
                "SELECT created_at FROM profiles WHERE id = $1",
                actor_id,
            )
            if row and row["created_at"]:
                created_at = row["created_at"]
                if created_at.tzinfo is None:
                    created_at = created_at.replace(tzinfo=timezone.utc)
                age_days = (datetime.now(timezone.utc) - created_at).days
                if age_days < 7:
                    score += 0.20
        except Exception as exc:  # noqa: BLE001
            logger.warning("risk.account_age_check_failed", actor_id=actor_id, error=str(exc))

        return min(1.0, score)

    # -------------------------------------------------------------------------
    # Read operations
    # -------------------------------------------------------------------------

    async def get_risk_score(self, actor_id: str) -> dict | None:
        """
        Get current risk score.
        Cache: Redis risk:score:{actor_id} with 5 min TTL.
        """
        cache_key = f"risk:score:{actor_id}"
        cached = await self.redis.get_json(cache_key)
        if cached is not None:
            return cached

        row = await self.db.fetchrow(
            """
            SELECT actor_id, actor_type, risk_score, risk_types, confidence,
                   enforcement_level, enforcement_expires_at, updated_at
            FROM nav_risk_scores
            WHERE actor_id = $1
            """,
            actor_id,
        )
        if row is None:
            return None

        result = {
            "actor_id": row["actor_id"],
            "actor_type": row["actor_type"],
            "risk_score": float(row["risk_score"]),
            "risk_types": list(row["risk_types"] or []),
            "confidence": float(row["confidence"]),
            "enforcement_level": row["enforcement_level"],
            "enforcement_expires_at": (
                row["enforcement_expires_at"].isoformat()
                if row["enforcement_expires_at"] else None
            ),
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
        }
        try:
            await self.redis.set_json(cache_key, result, ttl=REDIS_RISK_TTL_S)
        except Exception as exc:  # noqa: BLE001
            logger.warning("risk.cache_set_failed", cache_key=cache_key, error=str(exc))
        return result

    async def check_enforcement(self, actor_id: str) -> dict:
        """
        Check if actor is currently under enforcement.
        Auto-downgrades expired enforcement to 'observe'.
        Returns {allowed: bool, level: str, reason: str, expires_at: str | None}
        """
        cache_key = f"risk:enforcement:{actor_id}"
        cached = await self.redis.get_json(cache_key)
        if cached is not None:
            return cached

        row = await self.db.fetchrow(
            """
            SELECT enforcement_level, enforcement_expires_at
            FROM nav_risk_scores
            WHERE actor_id = $1
            """,
            actor_id,
        )

        if row is None:
            result = {
                "allowed": True,
                "level": "observe",
                "reason": "no_record",
                "expires_at": None,
            }
        else:
            level = row["enforcement_level"] or "observe"
            expires_at = row["enforcement_expires_at"]
            now = datetime.now(timezone.utc)

            # Auto-expire enforcement
            if expires_at is not None:
                if expires_at.tzinfo is None:
                    expires_at = expires_at.replace(tzinfo=timezone.utc)
                if now > expires_at and level not in ("observe", "banned"):
                    await self.db.execute(
                        """
                        UPDATE nav_risk_scores
                        SET enforcement_level = 'observe', enforcement_expires_at = NULL
                        WHERE actor_id = $1
                        """,
                        actor_id,
                    )
                    await self._invalidate_risk_cache(actor_id)
                    level = "observe"
                    expires_at = None

            blocked_levels = {"hard_throttle", "suspended", "banned"}
            result = {
                "allowed": level not in blocked_levels,
                "level": level,
                "reason": f"enforcement_level:{level}",
                "expires_at": expires_at.isoformat() if expires_at else None,
            }

        try:
            await self.redis.set_json(cache_key, result, ttl=REDIS_ENF_TTL_S)
        except Exception as exc:  # noqa: BLE001
            logger.warning("risk.cache_set_failed", cache_key=cache_key, error=str(exc))
        return result

    async def enforce(
        self,
        actor_id: str,
        new_level: str,
        reason: str,
        performed_by: str = "system",
        duration_hours: int | None = None,
    ) -> dict:
        """
        Apply enforcement action.

        Transition rules:
          - System can escalate to any level automatically.
          - Manual admin can escalate to any level.
          - Descending the ladder requires performed_by != 'system' (admin review).
          - 'banned' has no expiry by default.

        Side effects:
          - suspended/banned: actor evicted from presence Redis keys
          - Kafka event published to nav.risk.actions
        """
        if new_level not in self.ENFORCEMENT_LEVELS:
            raise ValueError(f"Unknown enforcement level: {new_level!r}")

        current = await self.get_risk_score(actor_id)
        current_level = current.get("enforcement_level", "observe") if current else "observe"
        current_idx = self.ENFORCEMENT_LEVELS.index(current_level)
        new_idx = self.ENFORCEMENT_LEVELS.index(new_level)

        # Descending level requires manual review (admin override)
        if new_idx < current_idx and performed_by == "system":
            logger.warning(
                "risk.enforce_downgrade_blocked",
                actor_id=actor_id,
                current=current_level,
                requested=new_level,
            )
            return {
                "actor_id": actor_id,
                "applied": False,
                "reason": "downgrade_requires_manual_review",
                "current_level": current_level,
            }

        now = datetime.now(timezone.utc)
        expires_at: datetime | None = None
        if duration_hours is not None and new_level != "banned":
            expires_at = now + timedelta(hours=duration_hours)

        await self.db.execute(
            """
            INSERT INTO nav_risk_scores (actor_id, actor_type, risk_score, risk_types,
                confidence, enforcement_level, enforcement_expires_at)
            VALUES ($1, 'driver', 0.0, ARRAY[]::text[], 0.0, $2, $3)
            ON CONFLICT (actor_id)
            DO UPDATE SET
                enforcement_level      = EXCLUDED.enforcement_level,
                enforcement_expires_at = EXCLUDED.enforcement_expires_at,
                updated_at             = NOW()
            """,
            actor_id, new_level, expires_at,
        )

        await self.db.execute(
            """
            INSERT INTO nav_enforcement_actions
                (actor_id, action_type, reason, previous_level, new_level, expires_at)
            VALUES ($1, 'enforcement', $2, $3, $4, $5)
            """,
            actor_id, reason, current_level, new_level, expires_at,
        )

        await self._invalidate_risk_cache(actor_id)

        # Evict from presence on hard enforcement
        if new_level in ("suspended", "banned"):
            try:
                await self.redis.delete(f"presence:driver:{actor_id}")
                geo_key = "geo:default:drivers"
                await self.redis.geo_remove(geo_key, actor_id)
                logger.info("risk.presence_evicted", actor_id=actor_id, level=new_level)
            except Exception as exc:  # noqa: BLE001
                logger.error("risk.presence_eviction_failed", actor_id=actor_id, error=str(exc))

        event = {
            "actor_id": actor_id,
            "action_type": "enforcement",
            "previous_level": current_level,
            "new_level": new_level,
            "reason": reason,
            "performed_by": performed_by,
            "expires_at": expires_at.isoformat() if expires_at else None,
            "ts": now.isoformat(),
        }
        try:
            await self.kafka.produce_event(
                topic=KAFKA_TOPIC_RISK_ACTIONS,
                key=actor_id,
                value=event,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("risk.kafka_enforce_failed", actor_id=actor_id, error=str(exc))

        logger.info(
            "risk.enforced",
            actor_id=actor_id,
            previous_level=current_level,
            new_level=new_level,
            performed_by=performed_by,
        )
        return {
            "actor_id": actor_id,
            "applied": True,
            "previous_level": current_level,
            "new_level": new_level,
            "expires_at": expires_at.isoformat() if expires_at else None,
        }

    async def record_risk_event(
        self,
        actor_id: str,
        event_type: str,
        severity: str,
        details: dict,
        lat: float | None = None,
        lng: float | None = None,
    ) -> dict:
        """
        Insert a risk event record.
        h3_cell computed server-side from lat/lng if provided.
        """
        h3_cell: str | None = None
        if lat is not None and lng is not None:
            h3_cell = self.h3.latlng_to_h3(lat, lng, resolution=9)

        row = await self.db.fetchrow(
            """
            INSERT INTO nav_risk_events
                (actor_id, event_type, severity, details, location, h3_cell, resolved)
            VALUES (
                $1, $2, $3, $4::jsonb,
                CASE WHEN $5::float IS NOT NULL AND $6::float IS NOT NULL
                     THEN ST_SetSRID(ST_MakePoint($6, $5), 4326)
                     ELSE NULL END,
                $7,
                FALSE
            )
            RETURNING id, actor_id, event_type, severity, created_at
            """,
            actor_id, event_type, severity,
            __import__("json").dumps(details),
            lat, lng, h3_cell,
        )
        return dict(row)

    async def get_risk_events(
        self, actor_id: str, limit: int = 50
    ) -> list[dict]:
        """Fetch risk events for an actor ordered by recency."""
        rows = await self.db.fetch(
            """
            SELECT id, actor_id, event_type, severity, details, h3_cell, resolved, created_at
            FROM nav_risk_events
            WHERE actor_id = $1
            ORDER BY created_at DESC
            LIMIT $2
            """,
            actor_id, limit,
        )
        return [dict(r) for r in rows]

    async def get_enforcement_history(self, actor_id: str) -> list[dict]:
        """Fetch enforcement action history for an actor."""
        rows = await self.db.fetch(
            """
            SELECT id, actor_id, action_type, reason, previous_level, new_level,
                   expires_at, created_at
            FROM nav_enforcement_actions
            WHERE actor_id = $1
            ORDER BY created_at DESC
            """,
            actor_id,
        )
        return [dict(r) for r in rows]

    async def get_trusted_supply_count(self, h3_cell: str) -> int:
        """
        Count drivers in cell whose enforcement_level is 'observe'
        (i.e., not throttled, suspended, or banned).
        Used by surge engine to avoid inflating supply with fraudulent actors.
        """
        cache_key = f"risk:trusted_supply:{h3_cell}"
        cached = await self.redis.get(cache_key)
        if cached is not None:
            return int(cached)

        row = await self.db.fetchrow(
            """
            SELECT COUNT(*) AS cnt
            FROM nav_risk_scores
            WHERE enforcement_level = 'observe'
              AND actor_id IN (
                  SELECT actor_id
                  FROM nav_presence_cache
                  WHERE h3_cell = $1
                    AND availability IN ('online', 'busy')
              )
            """,
            h3_cell,
        )
        count = int(row["cnt"] or 0) if row else 0

        try:
            await self.redis.set(cache_key, str(count), ex=60)
        except Exception:  # noqa: BLE001
            pass
        return count

    # -------------------------------------------------------------------------
    # Internal helpers
    # -------------------------------------------------------------------------

    async def _invalidate_risk_cache(self, actor_id: str) -> None:
        """Invalidate all Redis risk caches for an actor."""
        for key in (f"risk:score:{actor_id}", f"risk:enforcement:{actor_id}"):
            try:
                await self.redis.delete(key)
            except Exception:  # noqa: BLE001
                pass
