"""
Navigation Server — Trip Lifecycle Service

Responsibility:
  Full FSM for trip lifecycle: create → dispatch → assign → enroute →
  arrived → in_progress → completed / cancelled.

Pricing model (server-enforced, never from client):
  total = max(base + dist_cost + time_cost, MIN_FARE) * surge_multiplier

Concurrency:
  - Status transitions use optimistic concurrency (status guard in UPDATE WHERE).
  - Idempotency key on create prevents duplicate trip insertion.
  - Ratings are idempotent per user per trip.

Kafka topics:
  nav.trips — all lifecycle events

Security:
  - user_id always from JWT, never from request body.
  - Only the requester or the assigned driver may read the trip.
  - Only the assigned driver may drive status transitions to driver_* states.
  - 'in_progress' trips cannot be cancelled (must complete).
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog

from exceptions import ConflictError, ForbiddenError, NotFoundError
from models.common import LatLng
from models.routing import RouteRequest
from models.trips import TripCreateRequest, TripPrice, TripResponse, TripRoute

logger = structlog.get_logger(__name__)

KAFKA_TOPIC_TRIPS = "nav.trips"

CURRENCY = "RUB"
MAX_USER_TRIPS_LIMIT = 100


class TripService:
    """
    Trip lifecycle: create → dispatch → assign → enroute → arrived → in_progress → completed
    """

    # Pricing constants (values in kopeks-equivalent / minimal units)
    BASE_FARE: dict[str, float] = {
        "standard": 99.0,
        "comfort": 149.0,
        "business": 249.0,
        "premium": 249.0,
        "cargo": 299.0,
        "shared": 69.0,
        "delivery": 49.0,
    }
    PER_KM: dict[str, float] = {
        "standard": 12.0,
        "comfort": 16.0,
        "business": 22.0,
        "premium": 22.0,
        "cargo": 18.0,
        "shared": 8.0,
        "delivery": 8.0,
    }
    PER_MIN: dict[str, float] = {
        "standard": 8.0,
        "comfort": 11.0,
        "business": 14.0,
        "premium": 14.0,
        "cargo": 10.0,
        "shared": 5.0,
        "delivery": 5.0,
    }
    MIN_FARE: dict[str, float] = {
        "standard": 149.0,
        "comfort": 249.0,
        "business": 399.0,
        "premium": 399.0,
        "cargo": 399.0,
        "shared": 99.0,
        "delivery": 99.0,
    }

    # FSM: valid next states from each state
    VALID_TRANSITIONS: dict[str, list[str]] = {
        "requested": ["searching", "cancelled"],
        "searching": ["driver_assigned", "cancelled"],
        "driver_assigned": ["driver_enroute", "cancelled"],
        "driver_enroute": ["driver_arrived", "cancelled"],
        "driver_arrived": ["in_progress", "cancelled"],
        "in_progress": ["completed"],
        "completed": [],
        "cancelled": [],
    }

    # Cancellation fee threshold states
    FREE_CANCEL_STATES: frozenset[str] = frozenset({"requested", "searching"})
    # States where cancellation fee may apply (driver compensation logic)
    FEE_CANCEL_STATES: frozenset[str] = frozenset(
        {"driver_assigned", "driver_enroute", "driver_arrived"}
    )

    def __init__(
        self,
        db_pool: Any,
        redis: Any,
        kafka: Any,
        routing_service: Any,
        dispatch_service: Any,
    ) -> None:
        self.db = db_pool
        self.redis = redis
        self.kafka = kafka
        self.routing = routing_service
        self.dispatch = dispatch_service

    # ─────────────────────────────────────────────────────────────────────────
    # Create trip
    # ─────────────────────────────────────────────────────────────────────────

    async def create_trip(
        self, user_id: str, request: TripCreateRequest
    ) -> TripResponse:
        """
        1. Idempotency check by request.idempotency_key.
        2. Build route via Valhalla.
        3. Calculate estimated price with surge.
        4. INSERT INTO nav_trips (idempotency-safe).
        5. Publish trip.requested event.
        6. Trigger dispatch pipeline asynchronously.
        7. Return TripResponse with estimated route and price.
        """
        # Idempotency guard — return existing trip if key already seen
        existing = await self.db.fetch_one(
            "SELECT id FROM nav_trips WHERE idempotency_key=$1 AND requester_id=$2",
            request.idempotency_key,
            user_id,
        )
        if existing is not None:
            return await self.get_trip(str(existing["id"]), user_id)

        # 1. Route estimation
        route_req = RouteRequest(
            origin=request.pickup,
            destination=request.dropoff,
            waypoints=request.waypoints,
            costing="auto",
        )
        try:
            route_resp = await self.routing.route(route_req)
            best_route = route_resp.routes[0]
            distance_m = best_route.distance_m
            duration_s = best_route.duration_s
            encoded_polyline = _encode_route_polyline(best_route)
        except Exception as exc:
            logger.error("trip.routing_failed", user_id=user_id, error=str(exc))
            raise

        # 2. Surge multiplier for pickup zone
        surge = await self.dispatch._get_surge_multiplier(
            request.pickup.lat, request.pickup.lng
        )

        # 3. Price calculation
        price_data = await self.calculate_price(
            distance_m=distance_m,
            duration_s=duration_s,
            service_type=request.service_type,
            surge=surge,
        )

        # 4. Insert trip
        trip_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)

        await self.db.execute_query(
            """
            INSERT INTO nav_trips (
                id, requester_id, service_type, status,
                pickup_location, dropoff_location,
                estimated_distance_m, estimated_duration_s,
                estimated_price, surge_multiplier,
                estimated_polyline,
                payment_method, promo_code, notes,
                scheduled_at, idempotency_key,
                created_at, updated_at
            ) VALUES (
                $1, $2, $3, 'searching',
                ST_SetSRID(ST_MakePoint($4, $5), 4326),
                ST_SetSRID(ST_MakePoint($6, $7), 4326),
                $8, $9, $10, $11, $12,
                $13, $14, $15, $16, $17,
                $18, $18
            )
            """,
            trip_id,
            user_id,
            request.service_type,
            request.pickup.lng,
            request.pickup.lat,
            request.dropoff.lng,
            request.dropoff.lat,
            distance_m,
            duration_s,
            price_data["total"],
            surge,
            encoded_polyline,
            request.payment_method,
            request.promo_code,
            request.notes,
            request.scheduled_at,
            request.idempotency_key,
            now,
        )

        # 5. Kafka event
        await self._publish_trip_event(
            "trip.requested",
            trip_id=trip_id,
            user_id=user_id,
            service_type=request.service_type,
            ts=now,
        )

        logger.info(
            "trip.created",
            trip_id=trip_id,
            user_id=user_id,
            service_type=request.service_type,
            distance_m=distance_m,
            price=price_data["total"],
        )

        # 6. Dispatch asynchronously (non-blocking for this request)
        asyncio.create_task(self._dispatch_async(trip_id))

        # 7. Build response
        return TripResponse(
            trip_id=trip_id,
            status="searching",
            service_type=request.service_type,
            pickup=_latlng_to_geojson(request.pickup),
            dropoff=_latlng_to_geojson(request.dropoff),
            route=TripRoute(
                distance_m=distance_m,
                duration_s=duration_s,
                polyline=encoded_polyline,
            ),
            price=TripPrice(
                currency=CURRENCY,
                base_fare=price_data["base"],
                distance_fare=price_data["distance_cost"],
                time_fare=price_data["time_cost"],
                surge_multiplier=surge,
                surge_amount=price_data["surge_amount"],
                total=price_data["total"],
                is_estimate=True,
            ),
            created_at=now,
            updated_at=now,
            scheduled_at=request.scheduled_at,
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Read operations
    # ─────────────────────────────────────────────────────────────────────────

    async def get_trip(self, trip_id: str, user_id: str) -> TripResponse:
        """Load trip. Only requester or assigned driver can read it."""
        row = await self.db.fetch_one(
            """
            SELECT t.*,
                   ST_Y(t.pickup_location::geometry)  AS pickup_lat,
                   ST_X(t.pickup_location::geometry)  AS pickup_lng,
                   ST_Y(t.dropoff_location::geometry) AS dropoff_lat,
                   ST_X(t.dropoff_location::geometry) AS dropoff_lng
            FROM nav_trips t
            WHERE t.id = $1
            """,
            trip_id,
        )
        if row is None:
            raise NotFoundError("Trip not found", detail={"trip_id": trip_id})

        row = dict(row)
        requester_id = str(row.get("requester_id", ""))
        driver_id = str(row.get("driver_id", "") or "")

        if user_id not in (requester_id, driver_id):
            raise ForbiddenError(
                "Access denied to trip",
                detail={"trip_id": trip_id},
            )

        return _row_to_trip_response(row)

    async def get_user_trips(
        self,
        user_id: str,
        status: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[TripResponse]:
        """Get trips where user is requester or driver, with optional status filter."""
        limit = min(limit, MAX_USER_TRIPS_LIMIT)
        rows = await self.db.fetch_all(
            """
            SELECT t.*,
                   ST_Y(t.pickup_location::geometry)  AS pickup_lat,
                   ST_X(t.pickup_location::geometry)  AS pickup_lng,
                   ST_Y(t.dropoff_location::geometry) AS dropoff_lat,
                   ST_X(t.dropoff_location::geometry) AS dropoff_lng
            FROM nav_trips t
            WHERE (t.requester_id=$1 OR t.driver_id=$1)
              AND ($2::text IS NULL OR t.status=$2)
            ORDER BY t.created_at DESC
            LIMIT $3 OFFSET $4
            """,
            user_id,
            status,
            limit,
            offset,
        )
        return [_row_to_trip_response(dict(r)) for r in rows]

    # ─────────────────────────────────────────────────────────────────────────
    # Status transitions
    # ─────────────────────────────────────────────────────────────────────────

    async def update_trip_status(
        self,
        trip_id: str,
        new_status: str,
        user_id: str,
        metadata: dict | None = None,
    ) -> TripResponse:
        """
        FSM transition with strict validation and permission checks.
        Uses optimistic concurrency: UPDATE WHERE status=current_status.
        """
        row = await self.db.fetch_one(
            """
            SELECT id, status, requester_id, driver_id
            FROM nav_trips WHERE id=$1
            """,
            trip_id,
        )
        if row is None:
            raise NotFoundError("Trip not found", detail={"trip_id": trip_id})

        current_status = row["status"]
        requester_id = str(row["requester_id"])
        driver_id = str(row["driver_id"] or "")

        # Validate FSM transition
        allowed = self.VALID_TRANSITIONS.get(current_status, [])
        if new_status not in allowed:
            raise ConflictError(
                f"Transition {current_status!r} → {new_status!r} is not allowed",
                detail={"current": current_status, "allowed": allowed},
            )

        # Permission check: driver-side transitions vs requester-side
        _check_transition_permission(
            new_status=new_status,
            user_id=user_id,
            requester_id=requester_id,
            driver_id=driver_id,
        )

        now = datetime.now(timezone.utc)
        timestamp_col = _status_to_timestamp_col(new_status)
        extra_set = ""
        extra_params: list[Any] = []

        if timestamp_col:
            # Defensive hardening: dynamic SQL fragment is allowed only for a fixed whitelist.
            if timestamp_col not in {
                "assigned_at",
                "driver_enroute_at",
                "driver_arrived_at",
                "started_at",
                "completed_at",
                "cancelled_at",
            }:
                raise ValidationError(
                    "Unsupported timestamp column for status transition",
                    detail={"timestamp_col": timestamp_col, "status": new_status},
                )
            extra_set = f", {timestamp_col}=$5"
            extra_params = [now]

        # Optimistic update — guard on current status to avoid race condition
        updated = await self.db.fetch_one(
            f"""
            UPDATE nav_trips
            SET status=$1, updated_at=$2 {extra_set}
            WHERE id=$3 AND status=$4
            RETURNING id, status
            """,
            new_status,
            now,
            trip_id,
            current_status,
            *extra_params,
        )
        if updated is None:
            raise ConflictError(
                "Trip status changed concurrently",
                detail={"trip_id": trip_id, "expected_status": current_status},
            )

        # Side effects per transition
        await self._handle_transition_side_effects(
            trip_id=trip_id,
            new_status=new_status,
            driver_id=driver_id,
            requester_id=requester_id,
            user_id=user_id,
            now=now,
            metadata=metadata or {},
        )

        await self._publish_trip_event(
            "trip.status_changed",
            trip_id=trip_id,
            new_status=new_status,
            previous_status=current_status,
            user_id=user_id,
            ts=now,
        )

        logger.info(
            "trip.status_changed",
            trip_id=trip_id,
            from_status=current_status,
            to_status=new_status,
            user_id=user_id,
        )

        return await self.get_trip(trip_id, user_id)

    async def cancel_trip(
        self, trip_id: str, user_id: str, reason: str | None = None
    ) -> TripResponse:
        """
        Cancel trip with business rules:
        - requested / searching: free cancel, no penalties.
        - driver_assigned / driver_enroute / driver_arrived: 
          cancellation fee may apply (stored in nav_trips.cancellation_fee).
        - in_progress: not cancellable (ConflictError).
        - completed / cancelled: ConflictError.
        """
        row = await self.db.fetch_one(
            "SELECT id, status, requester_id, driver_id FROM nav_trips WHERE id=$1",
            trip_id,
        )
        if row is None:
            raise NotFoundError("Trip not found", detail={"trip_id": trip_id})

        current_status = row["status"]
        requester_id = str(row["requester_id"])
        driver_id = str(row["driver_id"] or "")

        # Permission: requester or assigned driver can cancel
        if user_id not in (requester_id, driver_id):
            raise ForbiddenError("Not authorised to cancel this trip")

        if current_status in ("completed", "cancelled"):
            raise ConflictError(
                f"Cannot cancel trip in status '{current_status}'",
                detail={"trip_id": trip_id},
            )
        if current_status == "in_progress":
            raise ConflictError(
                "Cannot cancel an in-progress trip",
                detail={"trip_id": trip_id, "hint": "Trip must be completed first"},
            )

        now = datetime.now(timezone.utc)
        cancellation_fee = 0.0
        cancelled_by = "requester" if user_id == requester_id else "driver"

        if current_status in self.FEE_CANCEL_STATES:
            # Apply cancellation fee for rider (not driver)
            if cancelled_by == "requester":
                cancellation_fee = 50.0  # flat fee in base currency unit

        await self.db.execute_query(
            """
            UPDATE nav_trips
            SET status='cancelled',
                cancellation_reason=$1,
                cancelled_at=$2,
                cancelled_by=$3,
                cancellation_fee=$4,
                updated_at=$2
            WHERE id=$5 AND status != 'cancelled'
            """,
            reason,
            now,
            cancelled_by,
            cancellation_fee,
            trip_id,
        )

        # Cancel any pending dispatch offers
        await self.db.execute_query(
            """
            UPDATE nav_dispatch_offers
            SET status='cancelled', responded_at=$1
            WHERE trip_id=$2 AND status='pending'
            """,
            now,
            trip_id,
        )

        # Update driver stats if driver cancelled
        if cancelled_by == "driver" and driver_id:
            await self.db.execute_query(
                """
                UPDATE nav_driver_profiles
                SET cancellation_rate = LEAST(100,
                    cancellation_rate * 0.9 + 10.0 * 0.1
                )
                WHERE id=$1
                """,
                driver_id,
            )

        await self._publish_trip_event(
            "trip.cancelled",
            trip_id=trip_id,
            cancelled_by=cancelled_by,
            reason=reason,
            cancellation_fee=cancellation_fee,
            ts=now,
        )

        logger.info(
            "trip.cancelled",
            trip_id=trip_id,
            cancelled_by=cancelled_by,
            from_status=current_status,
            fee=cancellation_fee,
        )

        return await self.get_trip(trip_id, user_id)

    # ─────────────────────────────────────────────────────────────────────────
    # Rating
    # ─────────────────────────────────────────────────────────────────────────

    async def rate_trip(
        self,
        trip_id: str,
        user_id: str,
        rating: int,
        comment: str | None = None,
    ) -> dict:
        """
        Rate completed trip (1–5 stars).
        Idempotency: user can only rate once per trip.
        """
        if not (1 <= rating <= 5):
            from exceptions import NavigationBaseError
            raise NavigationBaseError(
                "Rating must be between 1 and 5",
                detail={"rating": rating},
            )

        row = await self.db.fetch_one(
            """
            SELECT id, status, requester_id, driver_id,
                   rating_by_rider, rating_by_driver
            FROM nav_trips WHERE id=$1
            """,
            trip_id,
        )
        if row is None:
            raise NotFoundError("Trip not found", detail={"trip_id": trip_id})

        if row["status"] != "completed":
            raise ConflictError(
                "Only completed trips can be rated",
                detail={"current_status": row["status"]},
            )

        requester_id = str(row["requester_id"])
        driver_id = str(row["driver_id"] or "")

        if user_id == requester_id:
            if row["rating_by_rider"] is not None:
                raise ConflictError("Trip already rated by rider", detail={"trip_id": trip_id})
            await self.db.execute_query(
                "UPDATE nav_trips SET rating_by_rider=$1, rider_comment=$2 WHERE id=$3",
                rating,
                comment,
                trip_id,
            )
            # Update driver average rating
            if driver_id:
                await self.db.execute_query(
                    """
                    UPDATE nav_driver_profiles
                    SET rating = (
                        SELECT AVG(rating_by_rider)
                        FROM nav_trips
                        WHERE driver_id=$1
                          AND rating_by_rider IS NOT NULL
                    )
                    WHERE id=$1
                    """,
                    driver_id,
                )
            role = "rider"
        elif user_id == driver_id:
            if row["rating_by_driver"] is not None:
                raise ConflictError(
                    "Trip already rated by driver", detail={"trip_id": trip_id}
                )
            await self.db.execute_query(
                "UPDATE nav_trips SET rating_by_driver=$1, driver_comment=$2 WHERE id=$3",
                rating,
                comment,
                trip_id,
            )
            role = "driver"
        else:
            raise ForbiddenError("Not a participant in this trip")

        now = datetime.now(timezone.utc)
        await self._publish_trip_event(
            "trip.rated",
            trip_id=trip_id,
            rated_by=role,
            rating=rating,
            ts=now,
        )

        logger.info("trip.rated", trip_id=trip_id, rated_by=role, rating=rating)
        return {"trip_id": trip_id, "rated_by": role, "rating": rating}

    # ─────────────────────────────────────────────────────────────────────────
    # Pricing
    # ─────────────────────────────────────────────────────────────────────────

    async def calculate_price(
        self,
        distance_m: float,
        duration_s: float,
        service_type: str,
        surge: float = 1.0,
    ) -> dict:
        """
        Deterministic, server-enforced price calculation.

        base      = BASE_FARE[service_type]
        dist_cost = (distance_m / 1000) * PER_KM[service_type]
        time_cost = (duration_s / 60) * PER_MIN[service_type]
        subtotal  = base + dist_cost + time_cost
        surged    = subtotal * max(surge, 1.0)
        total     = max(surged, MIN_FARE[service_type])
        """
        stype = service_type if service_type in self.BASE_FARE else "standard"
        surge = max(1.0, surge)

        base = self.BASE_FARE[stype]
        dist_cost = (distance_m / 1000.0) * self.PER_KM[stype]
        time_cost = (duration_s / 60.0) * self.PER_MIN[stype]
        subtotal = base + dist_cost + time_cost
        surged = subtotal * surge
        surge_amount = surged - subtotal
        total = max(surged, self.MIN_FARE[stype])

        return {
            "base": round(base, 2),
            "distance_cost": round(dist_cost, 2),
            "time_cost": round(time_cost, 2),
            "subtotal": round(subtotal, 2),
            "surge_multiplier": surge,
            "surge_amount": round(surge_amount, 2),
            "total": round(total, 2),
            "currency": CURRENCY,
        }

    async def get_price_estimate(
        self,
        pickup: LatLng,
        dropoff: LatLng,
        service_type: str = "standard",
    ) -> dict:
        """
        Quick price estimate without creating a trip.
        1. Route via Valhalla.
        2. Surge for pickup location.
        3. Calculate price.
        Returns estimate dict including route summary.
        """
        route_req = RouteRequest(
            origin=pickup,
            destination=dropoff,
            waypoints=[],
            costing="auto",
        )
        route_resp = await self.routing.route(route_req)
        best = route_resp.routes[0]

        surge = await self.dispatch._get_surge_multiplier(pickup.lat, pickup.lng)
        price = await self.calculate_price(
            distance_m=best.distance_m,
            duration_s=best.duration_s,
            service_type=service_type,
            surge=surge,
        )

        return {
            **price,
            "distance_m": best.distance_m,
            "duration_s": best.duration_s,
            "route_summary": best.summary,
            "service_type": service_type,
            "is_estimate": True,
        }

    # ─────────────────────────────────────────────────────────────────────────
    # Internal helpers
    # ─────────────────────────────────────────────────────────────────────────

    async def _dispatch_async(self, trip_id: str) -> None:
        """Fire-and-forget dispatch trigger. Errors are logged, not raised."""
        try:
            await self.dispatch.dispatch_trip(trip_id)
        except Exception as exc:
            logger.error("trip.dispatch_async_failed", trip_id=trip_id, error=str(exc))

    async def _handle_transition_side_effects(
        self,
        trip_id: str,
        new_status: str,
        driver_id: str,
        requester_id: str,
        user_id: str,
        now: datetime,
        metadata: dict,
    ) -> None:
        """Deterministic side effects keyed on the destination FSM state."""
        if new_status == "driver_enroute":
            # Mark driver as busy in presence
            try:
                await self.dispatch.set_driver_availability(driver_id, "busy")
            except Exception as exc:
                logger.error(
                    "trip.presence_busy_failed", driver_id=driver_id, error=str(exc)
                )

        elif new_status == "completed":
            # Calculate actual price if actual_distance_m / actual_duration_s provided
            actual_dist = metadata.get("actual_distance_m")
            actual_dur = metadata.get("actual_duration_s")
            surge = metadata.get("surge_multiplier", 1.0)
            trip_stype = metadata.get("service_type", "standard")

            if actual_dist and actual_dur:
                price = await self.calculate_price(
                    distance_m=float(actual_dist),
                    duration_s=float(actual_dur),
                    service_type=trip_stype,
                    surge=float(surge),
                )
                await self.db.execute_query(
                    """
                    UPDATE nav_trips
                    SET actual_price=$1, actual_distance_m=$2, actual_duration_s=$3
                    WHERE id=$4
                    """,
                    price["total"],
                    actual_dist,
                    actual_dur,
                    trip_id,
                )

            # Release driver back to online
            if driver_id:
                try:
                    await self.dispatch.set_driver_availability(driver_id, "online")
                except Exception as exc:
                    logger.error(
                        "trip.presence_online_failed",
                        driver_id=driver_id,
                        error=str(exc),
                    )

        elif new_status == "cancelled":
            # Release driver back to online
            if driver_id:
                try:
                    await self.dispatch.set_driver_availability(driver_id, "online")
                except Exception as exc:
                    logger.error(
                        "trip.presence_release_failed",
                        driver_id=driver_id,
                        error=str(exc),
                    )

    async def _publish_trip_event(
        self,
        event_type: str,
        trip_id: str,
        ts: datetime,
        **extra: Any,
    ) -> None:
        event = {
            "event": event_type,
            "trip_id": trip_id,
            "ts": ts.isoformat(),
            **extra,
        }
        try:
            await self.kafka.produce_event(
                topic=KAFKA_TOPIC_TRIPS, key=trip_id, value=event
            )
        except Exception as exc:
            logger.error(
                "trip.kafka_publish_failed",
                event_type=event_type,
                trip_id=trip_id,
                error=str(exc),
            )


# ─────────────────────────────────────────────────────────────────────────────
# Module-level helpers
# ─────────────────────────────────────────────────────────────────────────────

def _check_transition_permission(
    new_status: str,
    user_id: str,
    requester_id: str,
    driver_id: str,
) -> None:
    """
    Permission matrix for FSM transitions:
    - driver_enroute, driver_arrived, in_progress, completed → driver only
    - searching, cancelled → requester only (or both for cancel)
    """
    driver_only = {"driver_enroute", "driver_arrived", "in_progress", "completed"}
    requester_only: set[str] = set()  # requester can cancel (handled in cancel_trip)

    if new_status in driver_only:
        if user_id != driver_id:
            raise ForbiddenError(
                f"Only the assigned driver can transition to '{new_status}'",
                detail={"new_status": new_status},
            )
    # cancelled is handled in cancel_trip with separate logic


def _status_to_timestamp_col(status: str) -> str | None:
    mapping = {
        "driver_assigned": "assigned_at",
        "driver_enroute": "driver_enroute_at",
        "driver_arrived": "driver_arrived_at",
        "in_progress": "started_at",
        "completed": "completed_at",
        "cancelled": "cancelled_at",
    }
    return mapping.get(status)


def _latlng_to_geojson(ll: LatLng) -> dict:
    """Convert LatLng to GeoJSONPoint-compatible dict for TripResponse."""
    from models.common import GeoJSONPoint
    return GeoJSONPoint(coordinates=[ll.lng, ll.lat])


def _encode_route_polyline(route: Any) -> str:
    """
    Extract encoded polyline from route geometry.
    Returns the coordinates as a JSON-encoded string if no encoded
    polyline is available from Valhalla (GeoJSON fallback).
    """
    import json
    if hasattr(route, "geometry") and hasattr(route.geometry, "coordinates"):
        return json.dumps(route.geometry.coordinates)
    return ""


def _row_to_trip_response(row: dict) -> TripResponse:
    """Convert a DB row (with pickup_lat/lng etc.) to TripResponse."""
    from models.common import GeoJSONPoint

    pickup_lat = float(row.get("pickup_lat", 0))
    pickup_lng = float(row.get("pickup_lng", 0))
    dropoff_lat = float(row.get("dropoff_lat", 0))
    dropoff_lng = float(row.get("dropoff_lng", 0))

    surge = float(row.get("surge_multiplier") or 1.0)
    estimated_price = float(row.get("estimated_price") or 0)
    distance_m = float(row.get("estimated_distance_m") or 0)
    duration_s = float(row.get("estimated_duration_s") or 0)

    # Reconstruct price breakdown from stored total (estimate)
    price = TripPrice(
        currency="RUB",
        base_fare=0.0,
        distance_fare=0.0,
        time_fare=0.0,
        surge_multiplier=surge,
        surge_amount=0.0,
        total=estimated_price,
        is_estimate=row.get("status") not in ("completed",),
    )

    route: TripRoute | None = None
    if distance_m > 0:
        route = TripRoute(
            distance_m=distance_m,
            duration_s=duration_s,
            polyline=row.get("estimated_polyline") or "",
        )

    return TripResponse(
        trip_id=str(row["id"]),
        status=row["status"],
        service_type=row["service_type"],
        pickup=GeoJSONPoint(coordinates=[pickup_lng, pickup_lat]),
        dropoff=GeoJSONPoint(coordinates=[dropoff_lng, dropoff_lat]),
        route=route,
        price=price,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        scheduled_at=row.get("scheduled_at"),
    )
