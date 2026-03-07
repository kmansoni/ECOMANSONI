"""
Navigation Server — Routing Service (Valhalla backend)

Design notes:
- Valhalla uses encoded polyline with precision=6 (1e-6 degrees per unit).
- Retry via tenacity: 3 attempts, exponential backoff, jitter.
- RoutingError raised on Valhalla 4xx/5xx — caller maps to HTTP 422/502.
- Cost estimation is deterministic (fuel price from config, CO2 IPCC constant).
"""
from __future__ import annotations

import math
from typing import Any

import httpx
import structlog
from tenacity import (
    AsyncRetrying,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from config import get_settings
from exceptions import RoutingError, UpstreamError
from models.common import GeoJSONLineString, LatLng
from models.routing import (
    IsochroneRequest,
    MatrixCell,
    MatrixRequest,
    MatrixResponse,
    OptimizedRouteRequest,
    Route,
    RouteCost,
    RouteLeg,
    RouteManeuver,
    RouteRequest,
    RouteResponse,
)

logger = structlog.get_logger(__name__)


class RoutingService:
    def __init__(self, valhalla_url: str, http_client: httpx.AsyncClient) -> None:
        self._base = str(valhalla_url).rstrip("/")
        self._http = http_client
        self._settings = get_settings()

    # ── Public API ────────────────────────────────────────────────────────────

    async def route(self, request: RouteRequest) -> RouteResponse:
        """
        Compute one or more routes between origin and destination.

        Flow:
        1. Build Valhalla /route JSON payload
        2. POST with retry
        3. Parse Valhalla trip → list[Route]
        4. Attach cost estimates
        """
        payload = self._build_valhalla_request(request)
        data = await self._post("/route", payload)

        if "trip" not in data:
            raise RoutingError(
                "Valhalla returned no trip",
                detail={"valhalla_status": data.get("status_message")},
            )

        routes = self._parse_valhalla_response(data)
        return RouteResponse(routes=routes)

    async def optimized_route(
        self, request: OptimizedRouteRequest
    ) -> RouteResponse:
        """
        TSP optimisation via Valhalla /optimized_route.
        Returns the route in the optimised visit order.
        """
        locations = [
            {"lon": loc.lng, "lat": loc.lat}
            for loc in request.locations
        ]
        payload: dict[str, Any] = {
            "locations": locations,
            "costing": request.costing,
            "units": "km",
        }
        if request.costing_options:
            payload["costing_options"] = {request.costing: request.costing_options}

        data = await self._post("/optimized_route", payload)

        if "trip" not in data:
            raise RoutingError(
                "Valhalla optimized_route returned no trip",
                detail={"valhalla_status": data.get("status_message")},
            )

        routes = self._parse_valhalla_response(data)
        return RouteResponse(routes=routes)

    async def matrix(self, request: MatrixRequest) -> MatrixResponse:
        """
        Distance/duration matrix via Valhalla /sources_to_targets.
        """
        sources = [{"lon": loc.lng, "lat": loc.lat} for loc in request.origins]
        targets = [{"lon": loc.lng, "lat": loc.lat} for loc in request.destinations]
        payload = {
            "sources": sources,
            "targets": targets,
            "costing": request.costing,
            "units": "km",
        }
        data = await self._post("/sources_to_targets", payload)

        cells: list[MatrixCell] = []
        for row_idx, row in enumerate(data.get("sources_to_targets", [])):
            for col_idx, cell in enumerate(row):
                dist = cell.get("distance")  # km in Valhalla response
                dur = cell.get("time")       # seconds
                status = "valid" if dist is not None else "no_route"
                cells.append(
                    MatrixCell(
                        from_index=row_idx,
                        to_index=col_idx,
                        distance_m=dist * 1000 if dist is not None else None,
                        duration_s=float(dur) if dur is not None else None,
                        status=status,
                    )
                )

        return MatrixResponse(
            sources=request.origins,
            targets=request.destinations,
            cells=cells,
        )

    async def isochrone(self, request: IsochroneRequest) -> dict:
        """
        Compute isochrone GeoJSON via Valhalla /isochrone.
        Returns the raw GeoJSON FeatureCollection.
        """
        contours = [
            {"time": minutes} for minutes in request.contours_minutes
        ]
        payload: dict[str, Any] = {
            "locations": [{"lon": request.origin.lng, "lat": request.origin.lat}],
            "costing": request.costing,
            "contours": contours,
            "polygons": request.polygons,
            "denoise": request.denoise,
            "generalize": request.generalize,
        }
        return await self._post("/isochrone", payload)

    # ── Valhalla request builder ───────────────────────────────────────────────

    def _build_valhalla_request(self, request: RouteRequest) -> dict:
        """
        Construct a Valhalla /route JSON payload from a RouteRequest.
        Reference: https://valhalla.github.io/valhalla/api/turn-by-turn/api-reference/
        """
        locations: list[dict] = []

        # Origin
        locations.append({"lon": request.origin.lng, "lat": request.origin.lat, "type": "break"})

        # Waypoints (through-points)
        for wp in request.waypoints:
            locations.append({"lon": wp.lng, "lat": wp.lat, "type": "through"})

        # Destination
        locations.append({
            "lon": request.destination.lng,
            "lat": request.destination.lat,
            "type": "break",
        })

        payload: dict[str, Any] = {
            "locations": locations,
            "costing": request.costing,
            "units": "km",
            "language": request.language,
            "alternates": request.alternatives,
            "directions_options": {
                "units": "km",
                "language": request.language,
                "narrative": True,
            },
        }

        # Costing options (speed limits, vehicle dims, etc.)
        costing_opts: dict[str, Any] = {}
        if request.avoid:
            avoid_map = {
                "tolls": "use_tolls",
                "highways": "use_highways",
                "ferries": "use_ferry",
            }
            for item in request.avoid:
                if item in avoid_map:
                    costing_opts[avoid_map[item]] = 0.0

        if request.costing_options:
            costing_opts.update(request.costing_options)

        if costing_opts:
            payload["costing_options"] = {request.costing: costing_opts}

        if request.departure_time:
            payload["date_time"] = {
                "type": 1,  # depart_at
                "value": request.departure_time.strftime("%Y-%m-%dT%H:%M"),
            }

        return payload

    # ── Valhalla response parser ───────────────────────────────────────────────

    def _parse_valhalla_response(self, data: dict) -> list[Route]:
        """
        Parse Valhalla /route response into a list of Route objects.
        Handles both single trip and alternates.
        """
        trips: list[dict] = []

        # Primary trip
        if "trip" in data:
            trips.append(data["trip"])

        # Alternates (Valhalla 3.x returns them as top-level "alternates" key)
        for alt in data.get("alternates", []):
            if "trip" in alt:
                trips.append(alt["trip"])

        routes: list[Route] = []
        for trip in trips:
            try:
                route = self._trip_to_route(trip)
                routes.append(route)
            except Exception as exc:
                logger.warning("routing.parse_trip_failed", error=str(exc))

        if not routes:
            raise RoutingError("Could not parse any routes from Valhalla response")

        return routes

    def _trip_to_route(self, trip: dict) -> Route:
        summary_data = trip.get("summary", {})
        total_distance_km: float = summary_data.get("length", 0.0)
        total_duration_s: float = summary_data.get("time", 0.0)

        legs: list[RouteLeg] = []
        all_coords: list[list[float]] = []

        for leg_data in trip.get("legs", []):
            leg = self._leg_to_model(leg_data)
            legs.append(leg)
            # Accumulate coordinates for the merged geometry
            if leg.geometry.coordinates:
                if all_coords:
                    # Avoid duplicate point at leg boundaries
                    all_coords.extend(leg.geometry.coordinates[1:])
                else:
                    all_coords.extend(leg.geometry.coordinates)

        merged_geometry = GeoJSONLineString(coordinates=all_coords or [[0, 0], [0, 0]])

        has_toll = summary_data.get("has_toll", False)
        has_highway = summary_data.get("has_highway", False)
        has_ferry = summary_data.get("has_ferry", False)

        cost = self._estimate_cost(
            distance_m=total_distance_km * 1000,
            duration_s=total_duration_s,
            costing=trip.get("costing", "auto"),
        )

        return Route(
            distance_m=total_distance_km * 1000,
            duration_s=total_duration_s,
            geometry=merged_geometry,
            legs=legs,
            summary=self._build_summary(total_distance_km * 1000, total_duration_s),
            cost=cost,
            has_toll=has_toll,
            has_highway=has_highway,
            has_ferry=has_ferry,
        )

    def _leg_to_model(self, leg_data: dict) -> RouteLeg:
        encoded_shape: str = leg_data.get("shape", "")
        coords = self._decode_polyline(encoded_shape, precision=6)

        maneuvers: list[RouteManeuver] = []
        for m in leg_data.get("maneuvers", []):
            maneuvers.append(
                RouteManeuver(
                    type=m.get("type", 0),
                    instruction=m.get("instruction", ""),
                    distance_m=m.get("length", 0.0) * 1000,
                    duration_s=m.get("time", 0.0),
                    begin_shape_index=m.get("begin_shape_index", 0),
                    end_shape_index=m.get("end_shape_index", 0),
                    street_names=m.get("street_names", []),
                    turn_degree=m.get("turn_degree"),
                    travel_mode=m.get("travel_mode"),
                    travel_type=m.get("travel_type"),
                )
            )

        summary = leg_data.get("summary", {})
        return RouteLeg(
            distance_m=summary.get("length", 0.0) * 1000,
            duration_s=summary.get("time", 0.0),
            geometry=GeoJSONLineString(coordinates=coords),
            maneuvers=maneuvers,
        )

    # ── Encoded polyline decoder ───────────────────────────────────────────────

    @staticmethod
    def _decode_polyline(encoded: str, precision: int = 6) -> list[list[float]]:
        """
        Decode a Google/Valhalla encoded polyline string to a list of
        [longitude, latitude] pairs (GeoJSON coordinate order).

        Algorithm:
        1. Iterate over ASCII characters left-to-right.
        2. Accumulate 5-bit chunks until a chunk has bit 5 == 0 (terminator).
        3. Left-shift the accumulated integer by 1; if LSB was set → negate.
        4. Divide by 10^precision to recover the decimal degree delta.
        5. Sum with running lat/lng accumulators.

        Valhalla uses precision=6 (standard Google uses 5).
        Returns [[lng, lat], …] for GeoJSON compliance.
        """
        coords: list[list[float]] = []
        index = 0
        length = len(encoded)
        lat = 0
        lng = 0
        scale = 10 ** precision

        while index < length:
            # ── Decode latitude delta ────────────────────────────────────────
            result = 0
            shift = 0
            while True:
                b = ord(encoded[index]) - 63
                index += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:  # terminator: bit 5 is 0
                    break
            dlat = ~(result >> 1) if result & 1 else result >> 1
            lat += dlat

            # ── Decode longitude delta ───────────────────────────────────────
            result = 0
            shift = 0
            while True:
                b = ord(encoded[index]) - 63
                index += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            dlng = ~(result >> 1) if result & 1 else result >> 1
            lng += dlng

            coords.append([lng / scale, lat / scale])  # [lon, lat] for GeoJSON

        return coords

    # ── Cost estimation ───────────────────────────────────────────────────────

    def _estimate_cost(
        self,
        distance_m: float,
        duration_s: float,
        costing: str,
    ) -> RouteCost:
        """
        Deterministic fuel/CO2 cost estimation.
        Only applies to motorised costings; returns zeroed model for walking/cycling.
        """
        s = self._settings

        if costing in ("pedestrian", "bicycle"):
            return RouteCost(fuel_liters=0.0, fuel_cost_rub=0.0, co2_grams=0.0)

        distance_km = distance_m / 1000.0
        fuel_liters = (distance_km / 100.0) * s.FUEL_CONSUMPTION_L_PER_100KM
        fuel_cost = fuel_liters * s.FUEL_PRICE_RUB_PER_LITER
        co2_grams = fuel_liters * s.CO2_GRAMS_PER_LITER_PETROL

        return RouteCost(
            fuel_liters=round(fuel_liters, 3),
            fuel_cost_rub=round(fuel_cost, 2),
            tolls_cost_rub=None,  # Valhalla doesn't return toll costs yet
            co2_grams=round(co2_grams, 1),
        )

    @staticmethod
    def _build_summary(distance_m: float, duration_s: float) -> str:
        distance_km = distance_m / 1000.0
        minutes = math.ceil(duration_s / 60)
        if distance_km < 1.0:
            dist_str = f"{int(distance_m)} м"
        else:
            dist_str = f"{distance_km:.1f} км"
        if minutes < 60:
            time_str = f"{minutes} мин"
        else:
            hours = minutes // 60
            mins = minutes % 60
            time_str = f"{hours} ч {mins} мин" if mins else f"{hours} ч"
        return f"{dist_str} · {time_str}"

    # ── HTTP helper ───────────────────────────────────────────────────────────

    async def _post(self, path: str, payload: dict) -> dict:
        """
        POST to Valhalla with retry (exponential backoff, max 3 attempts).
        - 4xx → RoutingError (client error, do not retry)
        - 5xx / network → UpstreamError (retried)
        """
        url = f"{self._base}{path}"
        settings = self._settings

        last_exc: Exception | None = None

        async for attempt in AsyncRetrying(
            stop=stop_after_attempt(settings.VALHALLA_MAX_RETRIES),
            wait=wait_exponential(multiplier=0.5, min=0.5, max=4.0),
            retry=retry_if_exception_type(UpstreamError),
            reraise=True,
        ):
            with attempt:
                try:
                    resp = await self._http.post(
                        url,
                        json=payload,
                        timeout=settings.VALHALLA_TIMEOUT,
                    )
                except (httpx.ConnectError, httpx.TimeoutException) as exc:
                    logger.warning("valhalla.connect_failed", url=url, error=str(exc))
                    raise UpstreamError(f"Valhalla unreachable: {exc}")

                if resp.status_code == 400:
                    body = resp.json()
                    raise RoutingError(
                        body.get("error", "Valhalla bad request"),
                        detail={"status_code": resp.status_code, "body": body},
                    )
                if resp.status_code == 404:
                    raise RoutingError(
                        "No route found",
                        detail={"valhalla_code": resp.status_code},
                    )
                if resp.status_code >= 500:
                    raise UpstreamError(
                        f"Valhalla server error {resp.status_code}",
                        detail={"url": url},
                    )

                return resp.json()

        # Should never reach here due to reraise=True
        raise UpstreamError("Valhalla request failed after retries")
