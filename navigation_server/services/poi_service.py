"""
Navigation Server — POI Service

All DB queries:
- Parameterised asyncpg — no string interpolation
- PostGIS ST_DWithin for spatial proximity (uses GIST index on geography column)
- pg_trgm GIN index for full-text search
- Cache: Redis JSON blobs per POI id (TTL 5 min), nearby results (TTL 1 min)
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

import structlog

from config import get_settings
from exceptions import NotFoundError
from models.common import GeoJSONPoint
from models.poi import POI, OpeningHours, POICreateRequest, POIUpdateRequest
from services.h3_service import H3Service

logger = structlog.get_logger(__name__)


class POIService:
    def __init__(self, db_pool, redis) -> None:
        self._db = db_pool
        self._redis = redis
        self._settings = get_settings()
        self._h3 = H3Service()

    # ── Nearby search ─────────────────────────────────────────────────────────

    async def search_nearby(
        self,
        lat: float,
        lng: float,
        radius_m: int,
        category: str | None = None,
        query: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[POI]:
        """
        Spatial proximity search via PostGIS ST_DWithin on geography column.
        Index: GIST on poi.location (geography).

        Query plan note: ST_DWithin uses the geography GIST index efficiently
        when radius ≤ geography index block size (~300 km). For city-scale
        searches (< 50 km) this is always index-only.
        """
        cache_key = (
            f"poi:nearby:{round(lat,4)}:{round(lng,4)}:{radius_m}"
            f":{category or ''}:{query or ''}:{limit}:{offset}"
        )
        cached = await self._redis.get(cache_key)
        if cached:
            rows = json.loads(cached)
            return [POI.model_validate(r) for r in rows]

        base_sql = """
            SELECT
                p.id::text,
                p.name,
                p.category,
                p.subcategory,
                ST_Y(p.location::geometry) AS lat,
                ST_X(p.location::geometry) AS lng,
                p.address,
                p.phone,
                p.website,
                p.rating,
                p.rating_count,
                p.opening_hours,
                p.tags,
                p.h3_index,
                p.created_at,
                p.updated_at,
                ST_Distance(
                    p.location,
                    ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
                ) AS distance_m
            FROM nav_pois p
            WHERE ST_DWithin(
                p.location,
                ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
                $3
            )
        """
        params: list = [lat, lng, radius_m]
        param_idx = 4

        if category:
            base_sql += f" AND p.category = ${param_idx}"
            params.append(category)
            param_idx += 1

        if query:
            base_sql += f" AND p.name % ${param_idx}"
            params.append(query)
            param_idx += 1

        base_sql += f" ORDER BY distance_m LIMIT ${param_idx} OFFSET ${param_idx + 1}"
        params.extend([limit, offset])

        rows = await self._db.fetch(base_sql, *params)
        pois = [self._row_to_poi(r) for r in rows]

        # Cache for 1 min (nearby results change frequently)
        await self._redis.setex(
            cache_key, 60, json.dumps([p.model_dump() for p in pois], default=str)
        )
        return pois

    # ── Get by ID ─────────────────────────────────────────────────────────────

    async def get_by_id(self, poi_id: str) -> POI:
        cache_key = f"poi:id:{poi_id}"
        cached = await self._redis.get(cache_key)
        if cached:
            return POI.model_validate(json.loads(cached))

        row = await self._db.fetchrow(
            """
            SELECT
                id::text, name, category, subcategory,
                ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng,
                address, phone, website, rating, rating_count,
                opening_hours, tags, h3_index, created_at, updated_at
            FROM nav_pois
            WHERE id = $1
            """,
            uuid.UUID(poi_id),
        )
        if not row:
            raise NotFoundError(f"POI {poi_id} not found")

        poi = self._row_to_poi(row)
        ttl = self._settings.POI_CACHE_TTL
        await self._redis.setex(
            cache_key, ttl, json.dumps(poi.model_dump(), default=str)
        )
        return poi

    # ── Full-text search ──────────────────────────────────────────────────────

    async def search_by_text(
        self,
        query: str,
        lat: float | None = None,
        lng: float | None = None,
        limit: int = 20,
    ) -> list[POI]:
        """
        pg_trgm similarity search on name + address.
        GIN index: CREATE INDEX ON nav_pois USING gin(name gin_trgm_ops).
        Requires pg_trgm extension to be enabled.
        """
        if lat is not None and lng is not None:
            sql = """
                SELECT
                    id::text, name, category, subcategory,
                    ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng,
                    address, phone, website, rating, rating_count,
                    opening_hours, tags, h3_index, created_at, updated_at,
                    ST_Distance(
                        location,
                        ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography
                    ) AS distance_m,
                    similarity(name, $1) AS sim
                FROM nav_pois
                WHERE name % $1
                ORDER BY sim DESC, distance_m ASC
                LIMIT $4
            """
            rows = await self._db.fetch(sql, query, lat, lng, limit)
        else:
            sql = """
                SELECT
                    id::text, name, category, subcategory,
                    ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng,
                    address, phone, website, rating, rating_count,
                    opening_hours, tags, h3_index, created_at, updated_at,
                    NULL AS distance_m,
                    similarity(name, $1) AS sim
                FROM nav_pois
                WHERE name % $1
                ORDER BY sim DESC
                LIMIT $2
            """
            rows = await self._db.fetch(sql, query, limit)

        return [self._row_to_poi(r) for r in rows]

    # ── Create ────────────────────────────────────────────────────────────────

    async def create(self, request: POICreateRequest, user_id: str) -> POI:
        poi_id = uuid.uuid4()
        h3_index = H3Service.latlng_to_h3(request.lat, request.lng, resolution=9)
        now = datetime.now(timezone.utc)

        opening_hours_json = (
            request.opening_hours.model_dump_json()
            if request.opening_hours
            else None
        )
        tags_json = json.dumps(request.tags)

        await self._db.execute(
            """
            INSERT INTO nav_pois (
                id, name, category, subcategory, location,
                address, phone, website, opening_hours, tags,
                h3_index, created_by, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4,
                ST_SetSRID(ST_MakePoint($6, $5), 4326)::geography,
                $7, $8, $9, $10::jsonb, $11::jsonb,
                $12, $13, $14, $14
            )
            """,
            poi_id,
            request.name,
            request.category,
            request.subcategory,
            request.lat,
            request.lng,
            request.address,
            request.phone,
            request.website,
            opening_hours_json,
            tags_json,
            h3_index,
            user_id,
            now,
        )

        logger.info("poi.created", poi_id=str(poi_id), user_id=user_id)
        return POI(
            id=str(poi_id),
            name=request.name,
            category=request.category,
            subcategory=request.subcategory,
            location=GeoJSONPoint.from_latlng(request.lat, request.lng),
            address=request.address,
            phone=request.phone,
            website=request.website,
            opening_hours=request.opening_hours,
            tags=request.tags,
            h3_index=h3_index,
            created_at=now,
            updated_at=now,
        )

    # ── Update ────────────────────────────────────────────────────────────────

    async def update(
        self, poi_id: str, request: POIUpdateRequest, user_id: str
    ) -> POI:
        """
        Partial update: only non-None fields are applied.
        Invalidates cache after update.
        """
        existing = await self.get_by_id(poi_id)  # raises NotFoundError if missing

        # Build SET clause dynamically for only provided fields
        set_parts: list[str] = []
        params: list = []
        idx = 2  # $1 = poi_id

        field_map = {
            "name": request.name,
            "category": request.category,
            "subcategory": request.subcategory,
            "address": request.address,
            "phone": request.phone,
            "website": request.website,
        }
        for col, val in field_map.items():
            if val is not None:
                set_parts.append(f"{col} = ${idx}")
                params.append(val)
                idx += 1

        if request.opening_hours is not None:
            set_parts.append(f"opening_hours = ${idx}::jsonb")
            params.append(request.opening_hours.model_dump_json())
            idx += 1

        if request.tags is not None:
            set_parts.append(f"tags = ${idx}::jsonb")
            params.append(json.dumps(request.tags))
            idx += 1

        set_parts.append(f"updated_at = ${idx}")
        now = datetime.now(timezone.utc)
        params.append(now)

        if len(set_parts) == 1:
            # Only updated_at changed — nothing meaningful to update
            return existing

        sql = f"UPDATE nav_pois SET {', '.join(set_parts)} WHERE id = $1"
        await self._db.execute(sql, uuid.UUID(poi_id), *params)

        # Invalidate cache
        await self._redis.delete(f"poi:id:{poi_id}")
        logger.info("poi.updated", poi_id=poi_id, user_id=user_id)

        return await self.get_by_id(poi_id)

    # ── Row → Model ───────────────────────────────────────────────────────────

    @staticmethod
    def _row_to_poi(row) -> POI:
        opening_hours = None
        if row["opening_hours"]:
            try:
                oh_data = (
                    row["opening_hours"]
                    if isinstance(row["opening_hours"], dict)
                    else json.loads(row["opening_hours"])
                )
                opening_hours = OpeningHours.model_validate(oh_data)
            except Exception:
                pass

        tags = {}
        if row["tags"]:
            try:
                tags = (
                    row["tags"]
                    if isinstance(row["tags"], dict)
                    else json.loads(row["tags"])
                )
            except Exception:
                pass

        return POI(
            id=str(row["id"]),
            name=row["name"],
            category=row["category"],
            subcategory=row.get("subcategory"),
            location=GeoJSONPoint.from_latlng(float(row["lat"]), float(row["lng"])),
            address=row.get("address"),
            phone=row.get("phone"),
            website=row.get("website"),
            rating=row.get("rating"),
            rating_count=row.get("rating_count"),
            distance_m=float(row["distance_m"]) if row.get("distance_m") is not None else None,
            opening_hours=opening_hours,
            tags=tags,
            h3_index=row.get("h3_index"),
            created_at=row.get("created_at"),
            updated_at=row.get("updated_at"),
        )
