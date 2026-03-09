"""
Navigation Server — Dispatch / Matching Engine

Architecture:
  Cascade dispatch pipeline:
    request → candidates (expanding radius) → filter (DB profile check) →
    ETA (Valhalla matrix) → score (weighted multi-factor) →
    offer (cascading, one-at-a-time) → FSM transition → Kafka event

Concurrency model:
  - respond_to_offer uses SELECT … FOR UPDATE SKIP LOCKED to prevent
    race conditions when multiple drivers simultaneously try to accept
    the same trip.
  - Offer round state is stored in Redis to survive API node restarts.

Attack surface mitigated:
  - Driver ID always comes from validated JWT, never from request body.
  - Offer expiry enforced server-side; expired offers are rejected.
  - Cascading offer state is locked at DB level; no TOCTOU gap.
  - Score manipulation: all weights enforced server-side.
"""
from __future__ import annotations

import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog

from exceptions import ConflictError, NotFoundError, ForbiddenError
from models.common import LatLng
from models.routing import MatrixRequest

logger = structlog.get_logger(__name__)

KAFKA_TOPIC_TRIPS = "nav.trips"
KAFKA_TOPIC_OFFERS = "nav.dispatch.offers"

# Scoring weights — must sum to 1.0
W_ETA = 0.40
W_ACCEPTANCE = 0.30
W_IDLE = 0.20
W_BALANCE = 0.10


class DispatchService:
    """
    Dispatch marketplace: matching riders/orders with drivers/couriers.
    Pipeline: request → candidates → filter → ETA → score → offer → FSM
    """

    INITIAL_SEARCH_RADIUS_M: int = 3_000
    MAX_SEARCH_RADIUS_M: int = 10_000
    RADIUS_STEP_M: int = 2_000
    MIN_CANDIDATES: int = 3
    MAX_CANDIDATES: int = 20
    OFFER_TIMEOUT_S: int = 15
    MAX_OFFER_ROUNDS: int = 3

    def __init__(
        self,
        db_pool: Any,
        redis: Any,
        kafka: Any,
        presence_service: Any,
        routing_service: Any,
        h3_service: Any,
    ) -> None:
        self.db = db_pool
        self.redis = redis
        self.kafka = kafka
        self.presence = presence_service
        self.routing = routing_service
        self.h3 = h3_service

    # ─────────────────────────────────────────────────────────────────────────
    # Public: main dispatch entrypoint
    # ─────────────────────────────────────────────────────────────────────────

    async def dispatch_trip(self, trip_id: str) -> dict:
        """
        Main dispatch pipeline.

        State machine guard: only trips in status='searching' enter here.
        Re-entrancy: if a prior dispatch round is already active (Redis lock),
        returns immediately to avoid double-dispatch.

        Returns:
            {dispatched: bool, offer_id: str|None, candidates_count: int,
             search_radius_m: int, latency_ms: int}
        """
        lock_key = f"dispatch:lock:{trip_id}"
        acquired = await self.redis.set_json(
            lock_key,
            {"locked_at": datetime.now(timezone.utc).isoformat()},
            ttl=60,  # 60s safety TTL — prevents permanent lock on crash
            nx=True,
        )
        if not acquired:
            logger.warning("dispatch.already_running", trip_id=trip_id)
            return {"dispatched": False, "reason": "already_in_progress"}

        t_start = time.monotonic()
        try:
            return await self._dispatch_pipeline(trip_id, t_start)
        finally:
            await self.redis.delete(lock_key)

    async def _dispatch_pipeline(self, trip_id: str, t_start: float) -> dict:
        # 1. Load trip
        trip = await self._load_trip(trip_id)
        if trip["status"] != "searching":
            raise ConflictError(
                f"Trip {trip_id} is not in 'searching' state",
                detail={"current_status": trip["status"]},
            )

        pickup_lat: float = trip["pickup_lat"]
        pickup_lng: float = trip["pickup_lng"]
        service_type: str = trip["service_type"]

        # Map service_type to vehicle_class
        vehicle_class = _service_type_to_vehicle_class(service_type)

        # 2. Surge multiplier for pickup zone
        surge = await self._get_surge_multiplier(pickup_lat, pickup_lng)

        # 3. Generate candidates (expanding radius)
        candidates, search_radius_m = await self._generate_candidates(
            pickup_lat, pickup_lng, vehicle_class, self.MAX_CANDIDATES
        )

        # 4. Filter candidates
        filtered = await self._filter_candidates(candidates, trip)
        h3_cells_searched = list({c.get("h3_index", "") for c in candidates if c.get("h3_index")})

        if not filtered:
            latency_ms = int((time.monotonic() - t_start) * 1000)
            await self._log_dispatch(
                trip_id=trip_id,
                candidates_count=len(candidates),
                radius_m=search_radius_m,
                h3_cells=h3_cells_searched,
                decision={"outcome": "no_candidates_after_filter"},
                latency_ms=latency_ms,
            )
            # Mark trip as no_drivers after max rounds
            await self._handle_no_drivers(trip_id)
            return {"dispatched": False, "reason": "no_candidates", "latency_ms": latency_ms}

        # 5. ETA computation for top candidates (max 10 routing calls)
        top_for_eta = filtered[: min(10, len(filtered))]
        with_etas = await self._estimate_etas(top_for_eta, pickup_lat, pickup_lng)

        # 6. Score
        scored = await self._score_candidates(with_etas, trip)

        # 7. Create cascading offers — first offer in the ranked list
        offers = await self._create_offers(trip_id, scored)

        latency_ms = int((time.monotonic() - t_start) * 1000)

        # 8. Log dispatch decision
        decision = {
            "outcome": "offers_sent",
            "offers": [o["offer_id"] for o in offers],
            "surge_multiplier": surge,
            "top_candidate": scored[0]["actor_id"] if scored else None,
        }
        await self._log_dispatch(
            trip_id=trip_id,
            candidates_count=len(candidates),
            radius_m=search_radius_m,
            h3_cells=h3_cells_searched,
            decision=decision,
            latency_ms=latency_ms,
        )

        logger.info(
            "dispatch.pipeline_complete",
            trip_id=trip_id,
            candidates=len(candidates),
            filtered=len(filtered),
            offers=len(offers),
            latency_ms=latency_ms,
        )

        return {
            "dispatched": True,
            "offer_id": offers[0]["offer_id"] if offers else None,
            "candidates_count": len(candidates),
            "search_radius_m": search_radius_m,
            "latency_ms": latency_ms,
        }

    # ─────────────────────────────────────────────────────────────────────────
    # Public: respond to dispatch offer
    # ─────────────────────────────────────────────────────────────────────────

    async def respond_to_offer(
        self,
        driver_id: str,
        offer_id: str,
        accepted: bool,
        rejection_reason: str | None = None,
    ) -> dict:
        """
        Driver responds to dispatch offer.

        Concurrency: SELECT … FOR UPDATE SKIP LOCKED ensures exactly one
        driver can accept a trip, even under parallel accept requests.

        FSM guard: only 'pending' offers with unexpired expires_at are actionable.
        """
        now = datetime.now(timezone.utc)

        # Lock the offer row to prevent concurrent accepts
        offer = await self.db.fetch_one(
            """
            SELECT o.*, t.status AS trip_status, t.requester_id
            FROM nav_dispatch_offers o
            JOIN nav_trips t ON t.id = o.trip_id
            WHERE o.id = $1
              AND o.driver_id = $2
            FOR UPDATE SKIP LOCKED
            """,
            offer_id,
            driver_id,
        )
        if offer is None:
            raise NotFoundError(
                "Offer not found or already locked by another transaction",
                detail={"offer_id": offer_id},
            )

        if offer["status"] != "pending":
            raise ConflictError(
                f"Offer {offer_id} is in status '{offer['status']}', not pending",
                detail={"offer_id": offer_id, "current_status": offer["status"]},
            )

        if offer["expires_at"] < now:
            # Expired — mark it, then try next candidate
            await self.db.execute_query(
                "UPDATE nav_dispatch_offers SET status='expired', responded_at=$1 WHERE id=$2",
                now,
                offer_id,
            )
            await self._advance_dispatch(offer["trip_id"])
            return {"offer_id": offer_id, "action": "expired", "next_dispatch": True}

        if accepted:
            return await self._accept_offer(offer, driver_id, now)
        else:
            return await self._reject_offer(offer, driver_id, rejection_reason, now)

    # ─────────────────────────────────────────────────────────────────────────
    # Driver availability
    # ─────────────────────────────────────────────────────────────────────────

    async def set_driver_availability(
        self, driver_id: str, availability: str
    ) -> dict:
        """Set driver availability (online / offline / busy).
        Updates presence in Redis and nav_driver_profiles.is_active in DB."""
        valid = {"online", "offline", "busy"}
        if availability not in valid:
            from exceptions import NavigationBaseError
            raise NavigationBaseError(
                f"Invalid availability: {availability!r}",
                detail={"valid": list(valid)},
            )
        profile = await self.db.fetch_one(
            "SELECT id, is_verified FROM nav_driver_profiles WHERE id=$1",
            driver_id,
        )
        if profile is None:
            raise NotFoundError("Driver profile not found", detail={"driver_id": driver_id})

        if availability == "online" and not bool(profile["is_verified"]):
            raise ForbiddenError(
                "Driver must be verified before going online",
                detail={"driver_id": driver_id},
            )

        row = await self.db.fetch_one(
            "SELECT driver_id, availability, is_active FROM public.nav_set_driver_availability($1, $2)",
            driver_id,
            availability,
        )

        if row is None:
            raise NotFoundError("Driver profile not found", detail={"driver_id": driver_id})
        return dict(row)

    async def get_pending_offers(self, driver_id: str) -> list[dict]:
        """Return non-expired pending offers for a driver."""
        now = datetime.now(timezone.utc)
        rows = await self.db.fetch_all(
            """
            SELECT o.id AS offer_id, o.trip_id, o.score, o.pickup_eta_s,
                   o.offered_at, o.expires_at,
                   t.pickup_location, t.dropoff_location,
                   t.service_type, t.estimated_price
            FROM nav_dispatch_offers o
            JOIN nav_trips t ON t.id = o.trip_id
            WHERE o.driver_id = $1
              AND o.status = 'pending'
              AND o.expires_at > $2
            ORDER BY o.offered_at DESC
            """,
            driver_id,
            now,
        )
        return [dict(r) for r in rows]

    async def get_driver_stats(self, driver_id: str) -> dict:
        """Return aggregated driver statistics."""
        profile = await self.db.fetch_one(
            """
            SELECT dp.rating, dp.acceptance_rate, dp.cancellation_rate,
                   dp.is_active, dp.vehicle_type, dp.vehicle_class,
                   COUNT(t.id) FILTER (WHERE t.status = 'completed') AS completed_trips,
                   COUNT(t.id) FILTER (WHERE t.status = 'cancelled'
                     AND t.driver_id = dp.id) AS cancelled_trips
            FROM nav_driver_profiles dp
            LEFT JOIN nav_trips t ON t.driver_id = dp.id
            WHERE dp.id = $1
            GROUP BY dp.id, dp.rating, dp.acceptance_rate, dp.cancellation_rate,
                     dp.is_active, dp.vehicle_type, dp.vehicle_class
            """,
            driver_id,
        )
        if profile is None:
            raise NotFoundError("Driver profile not found", detail={"driver_id": driver_id})
        return dict(profile)

    # ─────────────────────────────────────────────────────────────────────────
    # Pipeline steps
    # ─────────────────────────────────────────────────────────────────────────

    async def _generate_candidates(
        self,
        pickup_lat: float,
        pickup_lng: float,
        vehicle_class: str,
        max_candidates: int = 20,
    ) -> tuple[list[dict], int]:
        """
        Expanding radius search.
        Returns (candidates_list, effective_radius_m).
        Candidates include: actor_id, lat, lng, distance_m, h3_index.
        """
        radius_m = self.INITIAL_SEARCH_RADIUS_M

        while radius_m <= self.MAX_SEARCH_RADIUS_M:
            actors = await self.presence.get_nearby_actors(
                lat=pickup_lat,
                lng=pickup_lng,
                radius_m=radius_m,
                actor_type="driver",
                vehicle_class=vehicle_class,
                limit=max_candidates * 3,  # over-fetch for filter headroom
            )

            # Enrich with H3 index
            for a in actors:
                a["h3_index"] = self.h3.latlng_to_h3(a["lat"], a["lng"], resolution=9)

            if len(actors) >= self.MIN_CANDIDATES:
                return actors[:max_candidates], radius_m

            if radius_m >= self.MAX_SEARCH_RADIUS_M:
                # Return whatever we have even below MIN_CANDIDATES
                return actors[:max_candidates], radius_m

            radius_m = min(radius_m + self.RADIUS_STEP_M, self.MAX_SEARCH_RADIUS_M)

        return [], self.MAX_SEARCH_RADIUS_M

    async def _filter_candidates(
        self, candidates: list[dict], trip: dict
    ) -> list[dict]:
        """
        Multi-pass filter:
        1. DB profile: is_active=True, vehicle_class matches, not soft/hard throttled.
        2. No pending offers for same trip (idempotency).
        3. No more than 1 active concurrent trip per driver.
        """
        if not candidates:
            return []

        actor_ids = [c["actor_id"] for c in candidates]
        service_type = trip["service_type"]
        required_class = _service_type_to_vehicle_class(service_type)

        # Bulk DB fetch — single query for all candidates
        rows = await self.db.fetch_all(
            """
            SELECT dp.id,
                   dp.is_active,
                   dp.is_verified,
                   dp.vehicle_class,
                   dp.acceptance_rate,
                   dp.cancellation_rate,
                   dp.rating,
                   COALESCE(rs.enforcement_level, 'none') AS enforcement_level,
                   COALESCE(active_trips.cnt, 0) AS active_trips_count
            FROM nav_driver_profiles dp
            LEFT JOIN nav_risk_scores rs ON rs.entity_id = dp.id
                 AND rs.entity_type = 'driver'
                 AND rs.is_current = TRUE
            LEFT JOIN LATERAL (
                SELECT COUNT(*) AS cnt
                FROM nav_trips t2
                WHERE t2.driver_id = dp.id
                  AND t2.status IN ('driver_assigned','driver_enroute','driver_arrived','in_progress')
            ) active_trips ON TRUE
            WHERE dp.id = ANY($1::uuid[])
            """,
            actor_ids,
        )
        profile_map: dict[str, dict] = {str(r["id"]): dict(r) for r in rows}

        # Drivers who already have a pending offer for this trip
        existing_offer_rows = await self.db.fetch_all(
            """
            SELECT driver_id FROM nav_dispatch_offers
            WHERE trip_id = $1 AND status IN ('pending', 'accepted')
            """,
            trip["id"],
        )
        already_offered: set[str] = {str(r["driver_id"]) for r in existing_offer_rows}

        passed: list[dict] = []
        for c in candidates:
            aid = c["actor_id"]
            p = profile_map.get(aid)

            if p is None:
                logger.debug("dispatch.filter.no_profile", driver_id=aid)
                continue
            if not p["is_active"] or not p["is_verified"]:
                logger.debug("dispatch.filter.inactive", driver_id=aid)
                continue
            if p["vehicle_class"] != required_class:
                logger.debug(
                    "dispatch.filter.vehicle_class_mismatch",
                    driver_id=aid,
                    required=required_class,
                    actual=p["vehicle_class"],
                )
                continue
            if p["enforcement_level"] in ("hard_throttle", "suspended"):
                logger.debug(
                    "dispatch.filter.risk_throttled",
                    driver_id=aid,
                    level=p["enforcement_level"],
                )
                continue
            if p["active_trips_count"] >= 1:
                logger.debug("dispatch.filter.max_concurrent", driver_id=aid)
                continue
            if aid in already_offered:
                logger.debug("dispatch.filter.already_offered", driver_id=aid)
                continue

            # Enrich candidate with profile data for scoring
            passed.append(
                {
                    **c,
                    "acceptance_rate": float(p["acceptance_rate"] or 0),
                    "rating": float(p["rating"] or 0),
                    "cancellation_rate": float(p["cancellation_rate"] or 0),
                }
            )

        return passed

    async def _estimate_etas(
        self,
        candidates: list[dict],
        pickup_lat: float,
        pickup_lng: float,
    ) -> list[dict]:
        """
        Use Valhalla /sources_to_targets matrix to get ETA from each
        candidate location to pickup in one HTTP round-trip.

        Limited to first 10 candidates to keep routing load bounded.
        Candidates that return no_route get a large fallback ETA.
        """
        top = candidates[:10]
        if not top:
            return []

        sources = [LatLng(lat=c["lat"], lng=c["lng"]) for c in top]
        target = LatLng(lat=pickup_lat, lng=pickup_lng)

        matrix_req = MatrixRequest(
            origins=sources,
            destinations=[target],
            costing="auto",
        )

        try:
            matrix_resp = await self.routing.matrix(matrix_req)
        except Exception as exc:
            logger.error("dispatch.matrix_failed", error=str(exc))
            # Fallback: use straight-line distance / 10 m/s as ETA estimate
            for c in top:
                c["pickup_eta_s"] = c["distance_m"] / 10.0
            return top

        # matrix_resp.cells: from_index=i, to_index=0, duration_s
        eta_map: dict[int, float] = {}
        for cell in matrix_resp.cells:
            if cell.from_index not in eta_map:
                if cell.status == "valid" and cell.duration_s is not None:
                    eta_map[cell.from_index] = cell.duration_s
                else:
                    eta_map[cell.from_index] = 9999.0

        result: list[dict] = []
        for i, c in enumerate(top):
            eta = eta_map.get(i, c["distance_m"] / 10.0)
            result.append({**c, "pickup_eta_s": eta})

        return result

    async def _score_candidates(
        self, candidates: list[dict], trip: dict
    ) -> list[dict]:
        """
        Scoring formula (higher = better):
          score = W_ETA         * (1 - eta / max_eta)
                + W_ACCEPTANCE  * (acceptance_rate / 100)
                + W_IDLE        * (1 - idle_rank / total)
                + W_BALANCE     * balance_factor

        Deterministic: no random noise, reproducible ordering.
        idle_rank: drivers sorted by last_seen_ts ascending (older = more idle = higher score).
        balance_factor: zone supply/demand from Redis or 0.5 default.
        """
        if not candidates:
            return []

        max_eta = max((c.get("pickup_eta_s", 9999) for c in candidates), default=9999.0)
        if max_eta == 0:
            max_eta = 1.0

        total = len(candidates)

        # Sort by last_seen_ts to compute idle rank (oldest first → rank 0 → highest idle score)
        sorted_by_idle = sorted(
            candidates,
            key=lambda c: c.get("last_seen_ts") or "9999",
        )
        idle_rank_map = {c["actor_id"]: i for i, c in enumerate(sorted_by_idle)}

        # Zone balance factor from Redis
        trip_h3 = self.h3.latlng_to_h3(
            trip.get("pickup_lat", 0.0),
            trip.get("pickup_lng", 0.0),
            resolution=7,
        )
        balance_factor = await self._get_zone_balance_factor(trip_h3)

        scored: list[dict] = []
        for c in candidates:
            eta = c.get("pickup_eta_s", 9999.0)
            acceptance_prob = min(c.get("acceptance_rate", 50.0) / 100.0, 1.0)
            idle_rank = idle_rank_map.get(c["actor_id"], total // 2)

            eta_score = 1.0 - (eta / max_eta)
            idle_score = 1.0 - (idle_rank / max(total, 1))

            final_score = (
                W_ETA * eta_score
                + W_ACCEPTANCE * acceptance_prob
                + W_IDLE * idle_score
                + W_BALANCE * balance_factor
            )
            scored.append({**c, "score": round(final_score, 6)})

        scored.sort(key=lambda c: c["score"], reverse=True)
        return scored

    async def _create_offers(
        self, trip_id: str, scored_candidates: list[dict]
    ) -> list[dict]:
        """
        Cascading offer strategy: send one offer at a time, starting with
        the highest-scored candidate.

        Returns the list of created offer dicts (usually 1 on first round).
        """
        if not scored_candidates:
            return []

        best = scored_candidates[0]
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(seconds=self.OFFER_TIMEOUT_S)
        offer_id = str(uuid.uuid4())
        driver_id = best["actor_id"]
        eta_s = best.get("pickup_eta_s", 0.0)
        score = best.get("score", 0.0)

        await self.db.execute_query(
            """
            INSERT INTO nav_dispatch_offers
              (id, trip_id, driver_id, status, score, pickup_eta_s, offered_at, expires_at)
            VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7)
            """,
            offer_id,
            trip_id,
            driver_id,
            score,
            eta_s,
            now,
            expires_at,
        )

        event = {
            "event": "dispatch.offer_created",
            "offer_id": offer_id,
            "trip_id": trip_id,
            "driver_id": driver_id,
            "pickup_eta_s": eta_s,
            "score": score,
            "expires_at": expires_at.isoformat(),
            "ts": now.isoformat(),
        }
        try:
            await self.kafka.produce_event(
                topic=KAFKA_TOPIC_OFFERS,
                key=trip_id,
                value=event,
            )
        except Exception as exc:
            logger.error("dispatch.kafka_offer_failed", trip_id=trip_id, error=str(exc))

        logger.info(
            "dispatch.offer_created",
            offer_id=offer_id,
            trip_id=trip_id,
            driver_id=driver_id,
            score=score,
            eta_s=eta_s,
        )

        # Store remaining ranked candidates in Redis for cascading rounds
        remaining = [c["actor_id"] for c in scored_candidates[1:]]
        await self.redis.set_json(
            f"dispatch:candidates:{trip_id}",
            {"remaining": remaining, "round": 1},
            ex=self.OFFER_TIMEOUT_S * self.MAX_OFFER_ROUNDS + 60,
        )

        return [{"offer_id": offer_id, "driver_id": driver_id, "score": score}]

    # ─────────────────────────────────────────────────────────────────────────
    # Offer accept / reject internal logic
    # ─────────────────────────────────────────────────────────────────────────

    async def _accept_offer(
        self, offer: dict, driver_id: str, now: datetime
    ) -> dict:
        trip_id = str(offer["trip_id"])
        offer_id = str(offer["id"])

        # Guard: trip must still be in searching state
        if offer["trip_status"] not in ("searching", "driver_assigned"):
            raise ConflictError(
                "Trip is no longer available",
                detail={"trip_status": offer["trip_status"]},
            )

        # Mark offer accepted
        await self.db.execute_query(
            """
            UPDATE nav_dispatch_offers
            SET status='accepted', responded_at=$1
            WHERE id=$2
            """,
            now,
            offer_id,
        )

        # Assign driver to trip — atomic update with status guard
        updated = await self.db.fetch_one(
            """
            UPDATE nav_trips
            SET driver_id=$1,
                status='driver_assigned',
                assigned_at=$2,
                updated_at=$2
            WHERE id=$3
              AND status = 'searching'
            RETURNING id, status
            """,
            driver_id,
            now,
            trip_id,
        )
        if updated is None:
            # Another driver won the race — mark this accept as conflict
            await self.db.execute_query(
                "UPDATE nav_dispatch_offers SET status='conflict' WHERE id=$1",
                offer_id,
            )
            raise ConflictError(
                "Trip was assigned to another driver concurrently",
                detail={"trip_id": trip_id},
            )

        # Cancel all other pending offers for this trip
        await self.db.execute_query(
            """
            UPDATE nav_dispatch_offers
            SET status='cancelled', responded_at=$1
            WHERE trip_id=$2
              AND id != $3
              AND status = 'pending'
            """,
            now,
            trip_id,
            offer_id,
        )

        # Update driver acceptance rate incrementally (+1 accept)
        await self._update_acceptance_rate(driver_id, accepted=True)

        # Clean up cascade state
        await self.redis.delete(f"dispatch:candidates:{trip_id}")

        event = {
            "event": "trip.driver_assigned",
            "trip_id": trip_id,
            "driver_id": driver_id,
            "offer_id": offer_id,
            "ts": now.isoformat(),
        }
        try:
            await self.kafka.produce_event(
                topic=KAFKA_TOPIC_TRIPS, key=trip_id, value=event
            )
        except Exception as exc:
            logger.error("dispatch.kafka_assign_failed", trip_id=trip_id, error=str(exc))

        logger.info(
            "dispatch.offer_accepted",
            offer_id=offer_id,
            trip_id=trip_id,
            driver_id=driver_id,
        )
        return {"offer_id": offer_id, "action": "accepted", "trip_id": trip_id}

    async def _reject_offer(
        self,
        offer: dict,
        driver_id: str,
        rejection_reason: str | None,
        now: datetime,
    ) -> dict:
        offer_id = str(offer["id"])
        trip_id = str(offer["trip_id"])

        await self.db.execute_query(
            """
            UPDATE nav_dispatch_offers
            SET status='rejected', rejection_reason=$1, responded_at=$2
            WHERE id=$3
            """,
            rejection_reason,
            now,
            offer_id,
        )
        await self._update_acceptance_rate(driver_id, accepted=False)

        logger.info(
            "dispatch.offer_rejected",
            offer_id=offer_id,
            trip_id=trip_id,
            driver_id=driver_id,
            reason=rejection_reason,
        )

        # Cascade to next candidate
        await self._advance_dispatch(trip_id)
        return {"offer_id": offer_id, "action": "rejected", "trip_id": trip_id}

    async def _advance_dispatch(self, trip_id: str) -> None:
        """
        Try the next candidate in the cascade queue.
        If no more candidates or max rounds exceeded, mark trip no_drivers.
        """
        state = await self.redis.get_json(f"dispatch:candidates:{trip_id}")
        if state is None:
            await self._handle_no_drivers(trip_id)
            return

        remaining: list[str] = state.get("remaining", [])
        current_round: int = state.get("round", 1)

        if not remaining or current_round >= self.MAX_OFFER_ROUNDS:
            await self.redis.delete(f"dispatch:candidates:{trip_id}")
            await self._handle_no_drivers(trip_id)
            return

        next_driver_id = remaining[0]
        new_remaining = remaining[1:]

        # Create offer for next driver
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(seconds=self.OFFER_TIMEOUT_S)
        offer_id = str(uuid.uuid4())

        # Fetch ETA for the next candidate from presence
        presence = await self.presence.get_presence(next_driver_id, "driver")
        eta_s = 0.0
        if presence:
            dist = _haversine_m(
                presence.get("lat", 0),
                presence.get("lng", 0),
                0.0,  # pickup lat/lng not available here — use DB
                0.0,
            )
            # Rough estimate: 10 m/s avg speed
            eta_s = dist / 10.0

        # Load pickup coords from trip
        trip_row = await self.db.fetch_one(
            "SELECT pickup_lat, pickup_lng FROM nav_trips WHERE id=$1", trip_id
        )
        if trip_row and presence:
            eta_s = _haversine_m(
                presence.get("lat", 0),
                presence.get("lng", 0),
                float(trip_row["pickup_lat"]),
                float(trip_row["pickup_lng"]),
            ) / 10.0

        await self.db.execute_query(
            """
            INSERT INTO nav_dispatch_offers
              (id, trip_id, driver_id, status, score, pickup_eta_s, offered_at, expires_at)
            VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7)
            """,
            offer_id,
            trip_id,
            next_driver_id,
            0.0,  # cascaded offer — original scoring not re-run
            eta_s,
            now,
            expires_at,
        )

        await self.redis.set_json(
            f"dispatch:candidates:{trip_id}",
            {"remaining": new_remaining, "round": current_round + 1},
            ex=self.OFFER_TIMEOUT_S * self.MAX_OFFER_ROUNDS + 60,
        )

        event = {
            "event": "dispatch.offer_created",
            "offer_id": offer_id,
            "trip_id": trip_id,
            "driver_id": next_driver_id,
            "pickup_eta_s": eta_s,
            "round": current_round + 1,
            "ts": now.isoformat(),
        }
        try:
            await self.kafka.produce_event(
                topic=KAFKA_TOPIC_OFFERS, key=trip_id, value=event
            )
        except Exception as exc:
            logger.error(
                "dispatch.kafka_cascade_failed", trip_id=trip_id, error=str(exc)
            )

        logger.info(
            "dispatch.cascade_offer",
            offer_id=offer_id,
            trip_id=trip_id,
            driver_id=next_driver_id,
            round=current_round + 1,
        )

    async def _handle_no_drivers(self, trip_id: str) -> None:
        """Transition trip to cancelled with reason no_drivers."""
        now = datetime.now(timezone.utc)
        await self.db.execute_query(
            """
            UPDATE nav_trips
            SET status='cancelled',
                cancellation_reason='no_drivers',
                cancelled_at=$1,
                updated_at=$1
            WHERE id=$2
              AND status IN ('searching', 'requested')
            """,
            now,
            trip_id,
        )
        event = {
            "event": "trip.no_drivers",
            "trip_id": trip_id,
            "ts": now.isoformat(),
        }
        try:
            await self.kafka.produce_event(
                topic=KAFKA_TOPIC_TRIPS, key=trip_id, value=event
            )
        except Exception as exc:
            logger.error(
                "dispatch.kafka_no_drivers_failed", trip_id=trip_id, error=str(exc)
            )
        logger.warning("dispatch.no_drivers", trip_id=trip_id)

    # ─────────────────────────────────────────────────────────────────────────
    # Surge pricing
    # ─────────────────────────────────────────────────────────────────────────

    async def _get_surge_multiplier(self, lat: float, lng: float) -> float:
        """
        1. Compute H3 cell at resolution 8.
        2. Query nav_surge_pricing WHERE h3_cell=$cell AND effective_from <= now() AND effective_until > now().
        3. Return max active multiplier or 1.0.
        """
        h3_cell = self.h3.latlng_to_h3(lat, lng, resolution=8)
        now = datetime.now(timezone.utc)

        row = await self.db.fetch_one(
            """
            SELECT MAX(multiplier) AS multiplier
            FROM nav_surge_pricing
            WHERE h3_cell = $1
              AND effective_from <= $2
              AND effective_until > $2
            """,
            h3_cell,
            now,
        )
        if row and row["multiplier"] is not None:
            return float(row["multiplier"])
        return 1.0

    # ─────────────────────────────────────────────────────────────────────────
    # Helpers
    # ─────────────────────────────────────────────────────────────────────────

    async def _load_trip(self, trip_id: str) -> dict:
        row = await self.db.fetch_one(
            """
            SELECT id, requester_id, driver_id, service_type, status,
                   ST_Y(pickup_location::geometry) AS pickup_lat,
                   ST_X(pickup_location::geometry) AS pickup_lng,
                   ST_Y(dropoff_location::geometry) AS dropoff_lat,
                   ST_X(dropoff_location::geometry) AS dropoff_lng,
                   estimated_price, surge_multiplier
            FROM nav_trips
            WHERE id = $1
            """,
            trip_id,
        )
        if row is None:
            raise NotFoundError("Trip not found", detail={"trip_id": trip_id})
        return dict(row)

    async def _update_acceptance_rate(self, driver_id: str, accepted: bool) -> None:
        """
        Incrementally update acceptance_rate using an EMA-like recency-weighted formula.
        Formula: new_rate = old_rate * 0.9 + (100 if accepted else 0) * 0.1
        Bounded to [0, 100].
        """
        increment = 100.0 if accepted else 0.0
        await self.db.execute_query(
            """
            UPDATE nav_driver_profiles
            SET acceptance_rate = GREATEST(0, LEAST(100,
                acceptance_rate * 0.9 + $1 * 0.1
            ))
            WHERE id = $2
            """,
            increment,
            driver_id,
        )

    async def _get_zone_balance_factor(self, h3_cell: str) -> float:
        """
        Supply/demand balance for zone.
        Reads from Redis key zone:balance:{h3_cell} (set by demand forecasting service).
        Returns value in [0.0, 1.0]. Default 0.5 (neutral).
        """
        key = f"zone:balance:{h3_cell}"
        data = await self.redis.get_json(key)
        if data and "factor" in data:
            raw = float(data["factor"])
            return max(0.0, min(1.0, raw))
        return 0.5

    async def _log_dispatch(
        self,
        trip_id: str,
        candidates_count: int,
        radius_m: int,
        h3_cells: list[str],
        decision: dict,
        latency_ms: int,
    ) -> None:
        try:
            import json
            await self.db.execute_query(
                """
                INSERT INTO nav_dispatch_log
                  (trip_id, candidates_count, search_radius_m,
                   h3_cells_searched, scoring_algorithm, decision, latency_ms)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                """,
                trip_id,
                candidates_count,
                radius_m,
                h3_cells,
                "weighted_multi_factor_v1",
                json.dumps(decision),
                latency_ms,
            )
        except Exception as exc:
            logger.error("dispatch.log_failed", trip_id=trip_id, error=str(exc))


# ─────────────────────────────────────────────────────────────────────────────
# Module-level helpers
# ─────────────────────────────────────────────────────────────────────────────

def _service_type_to_vehicle_class(service_type: str) -> str:
    """Map service_type to the required vehicle_class stored in driver profiles."""
    mapping = {
        "standard": "economy",
        "comfort": "comfort",
        "business": "business",
        "cargo": "cargo",
        "shared": "economy",
        "premium": "business",
        "delivery": "moto",
    }
    return mapping.get(service_type, "economy")


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Haversine distance in metres. Used as fast ETA fallback."""
    import math
    R = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
