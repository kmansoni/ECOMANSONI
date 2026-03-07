"""
Navigation Server — Traffic Intelligence Service.

Responsibility:
  - Aggregate raw GPS batches into per-segment speed/congestion data
  - Persist to nav_traffic_segments (upsert, conflict on road_segment_id)
  - Cache hot segments in Redis (TTL 60s)
  - Publish aggregated events to Kafka nav.traffic.segments

Congestion model:
  speed_ratio = measured_speed / free_flow_speed
  free_flow  >= 0.8
  light      >= 0.6
  moderate   >= 0.4
  heavy      >= 0.2
  standstill  < 0.2

Security:
  - No client-supplied segment IDs accepted — segments resolved server-side
    via ST_DWithin snap-to-segment
  - GPS points capped at ±90 lat / ±180 lng before DB touch
  - All SQL is parameterised (asyncpg $N notation)

Scale:
  - process_location_batch: called by stream processor workers (stateless)
  - get_traffic_for_area: read-only, cache-first
  - Upsert uses ON CONFLICT DO UPDATE with idempotent column set
"""
from __future__ import annotations

import math
import statistics
from datetime import datetime, timezone
from typing import Any

import structlog

from services.h3_service import H3Service

logger = structlog.get_logger(__name__)

REDIS_SEGMENT_TTL_S = 60          # hot segment cache TTL
REDIS_SUMMARY_TTL_S = 30          # city-summary cache TTL
KAFKA_TOPIC_TRAFFIC = "nav.traffic.segments"
SNAP_RADIUS_M = 50                 # max GPS→segment snap distance
H3_RESOLUTION = 9                 # GPS grouping resolution


class TrafficService:
    """Traffic Intelligence — aggregates GPS streams into road segment speed/congestion."""

    CONGESTION_THRESHOLDS = {
        "free_flow": 0.8,
        "light": 0.6,
        "moderate": 0.4,
        "heavy": 0.2,
        "standstill": 0.0,
    }

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
    # Batch GPS ingestion
    # -------------------------------------------------------------------------

    async def process_location_batch(self, locations: list[dict]) -> dict:
        """
        Aggregate GPS data into road-segment speed/congestion records.

        Protocol:
          1. Validate and sanitise each location record
          2. Group by H3 cell (r9) to localise DB queries
          3. For each unique cell, snap GPS points to nearest road segment
             (ST_DWithin 50 m) via snap_to_segment
          4. Aggregate speeds per segment: median + sample count
          5. Determine congestion level from speed ratio
          6. Upsert nav_traffic_segments (ON CONFLICT road_segment_id DO UPDATE)
          7. Cache hot segments in Redis
          8. Publish aggregated events to Kafka nav.traffic.segments
          9. Return summary {processed, segments_updated, errors}

        Failure handling:
          - Individual snap failures are logged and skipped; they do not abort
            the batch. The caller (stream processor) should retry only on
            catastrophic DB errors (raised as exceptions).
        """
        if not locations:
            return {"processed": 0, "segments_updated": 0, "errors": 0}

        valid: list[dict] = []
        errors = 0
        for loc in locations:
            try:
                lat = float(loc["lat"])
                lng = float(loc["lng"])
                speed_mps = float(loc.get("speed_mps", 0.0))
                if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
                    raise ValueError("out of range")
                valid.append({
                    "lat": lat,
                    "lng": lng,
                    "speed_mps": max(0.0, speed_mps),
                    "actor_id": str(loc.get("actor_id", "")),
                })
            except (KeyError, ValueError, TypeError):
                errors += 1

        if not valid:
            return {"processed": 0, "segments_updated": 0, "errors": errors}

        # Group by H3 cell
        cells: dict[str, list[dict]] = {}
        for point in valid:
            cell = self.h3.latlng_to_h3(point["lat"], point["lng"], resolution=H3_RESOLUTION)
            cells.setdefault(cell, []).append(point)

        # Per-cell: snap points to segments, accumulate speeds
        segment_speeds: dict[str, list[float]] = {}
        segment_meta: dict[str, dict] = {}

        for cell, points in cells.items():
            for point in points:
                seg = await self.snap_to_segment(point["lat"], point["lng"])
                if seg is None:
                    continue
                seg_id = seg["id"]
                speed_kmh = point["speed_mps"] * 3.6
                segment_speeds.setdefault(seg_id, []).append(speed_kmh)
                if seg_id not in segment_meta:
                    segment_meta[seg_id] = {
                        "free_flow_speed_kmh": float(seg.get("speed_limit_kmh") or 50.0),
                        "h3_cell": cell,
                        "name": seg.get("name"),
                        "road_class": seg.get("road_class"),
                    }

        if not segment_speeds:
            return {"processed": len(valid), "segments_updated": 0, "errors": errors}

        # Aggregate and upsert
        now = datetime.now(timezone.utc)
        updated = 0
        kafka_events: list[dict] = []

        for seg_id, speeds in segment_speeds.items():
            meta = segment_meta[seg_id]
            median_speed = statistics.median(speeds)
            sample_count = len(speeds)
            free_flow = meta["free_flow_speed_kmh"]
            congestion = self._determine_congestion(median_speed, free_flow)
            confidence = min(1.0, sample_count / 10.0)  # 10 samples = full confidence

            await self.db.execute(
                """
                INSERT INTO nav_traffic_segments
                    (road_segment_id, speed_kmh, free_flow_speed_kmh, congestion_level,
                     confidence, sample_count, h3_cell, measured_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (road_segment_id)
                DO UPDATE SET
                    speed_kmh         = EXCLUDED.speed_kmh,
                    free_flow_speed_kmh = EXCLUDED.free_flow_speed_kmh,
                    congestion_level  = EXCLUDED.congestion_level,
                    confidence        = EXCLUDED.confidence,
                    sample_count      = EXCLUDED.sample_count,
                    h3_cell           = EXCLUDED.h3_cell,
                    measured_at       = EXCLUDED.measured_at
                """,
                seg_id,
                round(median_speed, 2),
                round(free_flow, 2),
                congestion,
                round(confidence, 3),
                sample_count,
                meta["h3_cell"],
                now,
            )

            # Redis cache for hot segments
            redis_key = f"traffic:seg:{seg_id}"
            cache_payload = {
                "road_segment_id": seg_id,
                "speed_kmh": round(median_speed, 2),
                "free_flow_speed_kmh": round(free_flow, 2),
                "congestion_level": congestion,
                "confidence": round(confidence, 3),
                "sample_count": sample_count,
                "h3_cell": meta["h3_cell"],
                "measured_at": now.isoformat(),
            }
            try:
                await self.redis.set_json(redis_key, cache_payload, ttl=REDIS_SEGMENT_TTL_S)
            except Exception as exc:  # noqa: BLE001
                logger.warning("traffic.redis_cache_failed", seg_id=seg_id, error=str(exc))

            kafka_events.append(cache_payload)
            updated += 1

        # Publish batch to Kafka as individual events
        for event in kafka_events:
            try:
                await self.kafka.produce_event(
                    topic=KAFKA_TOPIC_TRAFFIC,
                    key=event["road_segment_id"],
                    value=event,
                )
            except Exception as exc:  # noqa: BLE001
                logger.error("traffic.kafka_failed", seg_id=event["road_segment_id"], error=str(exc))

        logger.info(
            "traffic.batch_processed",
            input_points=len(valid),
            segments_updated=updated,
            errors=errors,
        )
        return {"processed": len(valid), "segments_updated": updated, "errors": errors}

    # -------------------------------------------------------------------------
    # Read operations
    # -------------------------------------------------------------------------

    async def get_traffic_for_area(
        self,
        min_lat: float,
        min_lng: float,
        max_lat: float,
        max_lng: float,
    ) -> list[dict]:
        """
        Traffic data for a bounding box.
        Only returns records fresher than 15 minutes.
        Bounding-box validated server-side; malformed boxes return empty list.
        """
        if not (
            -90 <= min_lat <= 90 and -90 <= max_lat <= 90
            and -180 <= min_lng <= 180 and -180 <= max_lng <= 180
            and min_lat < max_lat and min_lng < max_lng
        ):
            return []

        rows = await self.db.fetch(
            """
            SELECT
                ts.road_segment_id,
                ts.speed_kmh,
                ts.free_flow_speed_kmh,
                ts.congestion_level,
                ts.confidence,
                ts.sample_count,
                ts.h3_cell,
                ts.measured_at,
                rs.name,
                rs.road_class,
                rs.speed_limit_kmh,
                ST_AsGeoJSON(rs.geometry)::json AS geometry
            FROM nav_traffic_segments ts
            JOIN nav_road_segments rs ON rs.id = ts.road_segment_id
            WHERE ST_Intersects(
                rs.geometry,
                ST_MakeEnvelope($1, $2, $3, $4, 4326)
            )
            AND ts.measured_at > NOW() - INTERVAL '15 minutes'
            ORDER BY ts.confidence DESC, ts.measured_at DESC
            LIMIT 2000
            """,
            min_lng, min_lat, max_lng, max_lat,
        )
        return [dict(r) for r in rows]

    async def get_traffic_for_route(self, route_geometry: list[list[float]]) -> list[dict]:
        """
        Traffic data along a route polyline.
        route_geometry: list of [lng, lat] pairs.
        Builds a linestring and finds intersecting segments within 30m buffer.
        """
        if len(route_geometry) < 2:
            return []

        # Build WKT linestring from coordinate pairs
        coords_wkt = ", ".join(f"{lng} {lat}" for lng, lat in route_geometry)
        linestring_wkt = f"LINESTRING({coords_wkt})"

        rows = await self.db.fetch(
            """
            SELECT
                ts.road_segment_id,
                ts.speed_kmh,
                ts.free_flow_speed_kmh,
                ts.congestion_level,
                ts.confidence,
                ts.sample_count,
                ts.h3_cell,
                ts.measured_at,
                rs.name,
                rs.road_class,
                ST_AsGeoJSON(rs.geometry)::json AS geometry
            FROM nav_traffic_segments ts
            JOIN nav_road_segments rs ON rs.id = ts.road_segment_id
            WHERE ST_DWithin(
                rs.geometry::geography,
                ST_GeomFromText($1, 4326)::geography,
                30
            )
            AND ts.measured_at > NOW() - INTERVAL '15 minutes'
            ORDER BY ST_LineLocatePoint(
                ST_GeomFromText($1, 4326),
                ST_ClosestPoint(rs.geometry, ST_GeomFromText($1, 4326))
            )
            """,
            linestring_wkt,
        )
        return [dict(r) for r in rows]

    async def get_traffic_summary(self, city_id: str = "default") -> dict:
        """
        City-wide traffic summary.
        Cache key: traffic:summary:{city_id} with 30s TTL.
        """
        cache_key = f"traffic:summary:{city_id}"
        cached = await self.redis.get_json(cache_key)
        if cached is not None:
            return cached

        # Aggregate across all fresh segments
        row = await self.db.fetchrow(
            """
            SELECT
                COUNT(*)                          AS total_segments,
                AVG(speed_kmh / NULLIF(free_flow_speed_kmh, 0)) AS avg_speed_ratio,
                COUNT(*) FILTER (WHERE congestion_level = 'free_flow')  AS free_flow_count,
                COUNT(*) FILTER (WHERE congestion_level = 'light')      AS light_count,
                COUNT(*) FILTER (WHERE congestion_level = 'moderate')   AS moderate_count,
                COUNT(*) FILTER (WHERE congestion_level = 'heavy')      AS heavy_count,
                COUNT(*) FILTER (WHERE congestion_level = 'standstill') AS standstill_count
            FROM nav_traffic_segments
            WHERE measured_at > NOW() - INTERVAL '15 minutes'
            """
        )

        worst_rows = await self.db.fetch(
            """
            SELECT
                ts.road_segment_id,
                ts.speed_kmh,
                ts.free_flow_speed_kmh,
                ts.congestion_level,
                rs.name,
                rs.road_class
            FROM nav_traffic_segments ts
            JOIN nav_road_segments rs ON rs.id = ts.road_segment_id
            WHERE ts.measured_at > NOW() - INTERVAL '15 minutes'
              AND ts.congestion_level IN ('heavy', 'standstill')
            ORDER BY ts.speed_kmh / NULLIF(ts.free_flow_speed_kmh, 0) ASC
            LIMIT 10
            """
        )

        total = int(row["total_segments"] or 0)
        summary = {
            "city_id": city_id,
            "total_segments": total,
            "avg_speed_ratio": float(row["avg_speed_ratio"] or 1.0),
            "congestion_distribution": {
                "free_flow":  int(row["free_flow_count"] or 0),
                "light":      int(row["light_count"] or 0),
                "moderate":   int(row["moderate_count"] or 0),
                "heavy":      int(row["heavy_count"] or 0),
                "standstill": int(row["standstill_count"] or 0),
            },
            "worst_segments": [dict(r) for r in worst_rows],
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

        try:
            await self.redis.set_json(cache_key, summary, ttl=REDIS_SUMMARY_TTL_S)
        except Exception as exc:  # noqa: BLE001
            logger.warning("traffic.summary_cache_failed", error=str(exc))

        return summary

    async def snap_to_segment(self, lat: float, lng: float) -> dict | None:
        """
        Find nearest road segment for a GPS point within SNAP_RADIUS_M.
        Returns None if no segment found within radius.
        """
        # Check Redis cache for this exact cell first (micro-optimisation)
        row = await self.db.fetchrow(
            """
            SELECT
                id,
                name,
                road_class,
                speed_limit_kmh,
                ST_Distance(
                    geometry::geography,
                    ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
                ) AS dist_m
            FROM nav_road_segments
            WHERE ST_DWithin(
                geometry::geography,
                ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                $3
            )
            ORDER BY dist_m ASC
            LIMIT 1
            """,
            lng, lat, float(SNAP_RADIUS_M),
        )
        if row is None:
            return None
        return dict(row)

    # -------------------------------------------------------------------------
    # Internal helpers
    # -------------------------------------------------------------------------

    def _determine_congestion(self, speed_kmh: float, free_flow_kmh: float) -> str:
        """
        Determine congestion level from speed ratio.
        If free_flow_kmh is 0 or negative, returns 'free_flow' (data quality guard).
        """
        if free_flow_kmh <= 0:
            return "free_flow"
        ratio = speed_kmh / free_flow_kmh
        if ratio >= 0.8:
            return "free_flow"
        if ratio >= 0.6:
            return "light"
        if ratio >= 0.4:
            return "moderate"
        if ratio >= 0.2:
            return "heavy"
        return "standstill"
