"""
Navigation Server — Crowdsource Service.

Manages user-submitted road condition reports (incidents, cameras, police, etc.).

Report lifecycle state machine:
  submitted ──[VERIFY_THRESHOLD upvotes]──► verified ──[TTL expires]──► expired
  submitted ──[REJECT_THRESHOLD net votes]──► rejected
  verified  ──[TTL expires]──────────────────────────────────────────► expired
  any       ──[admin action]────────────────────────────────────────► deleted

Duplicate detection:
  - Same report_type + same H3 cell (resolution 9) within 10 minutes → increment
    existing report's confidence_score instead of inserting a new row.

Verification:
  - VERIFY_THRESHOLD = 3 independent upvotes → status = 'verified'
  - REJECT_THRESHOLD = -2 net votes (upvotes - downvotes) → status = 'rejected'

Security notes:
  - user_id comes from JWT (server-authoritative), never from request body
  - Voting is idempotent per (user_id, report_id) pair via nav_report_votes
  - Self-voting is blocked server-side
  - Rate limiting is enforced at the router layer (not here)
  - SQL parameters are always positional ($N) to prevent injection
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from typing import Any

import structlog

from exceptions import NotFoundError, ValidationError, ConflictError  # type: ignore[import]
from models.common import BBox
from services.h3_service import H3Service

logger = structlog.get_logger(__name__)

KAFKA_TOPIC_REPORTS = "nav.crowdsource.reports"

VALID_REPORT_TYPES = frozenset({
    "accident", "police", "camera", "road_work",
    "hazard", "closure", "pothole",
})

REPORT_TTL_SECONDS: dict[str, int] = {
    "accident":  3600,
    "police":    1800,
    "camera":    86400 * 365,
    "road_work": 86400 * 7,
    "hazard":    3600,
    "closure":   86400,
    "pothole":   86400 * 30,
}

VERIFY_THRESHOLD = 3     # Upvotes (absolute) needed to mark verified
REJECT_THRESHOLD = -2    # Net votes (upvotes - downvotes) to reject
DUP_WINDOW_MINUTES = 10  # Duplicate detection window

VALID_VOTE_TYPES = frozenset({"upvote", "downvote"})


class CrowdsourceService:
    """Crowdsource reports — create, vote, search, expire."""

    def __init__(
        self,
        db_pool: Any,
        redis: Any,
        kafka_producer: Any,
        h3_service: H3Service,
    ) -> None:
        self.db = db_pool
        self.redis = redis
        self.kafka = kafka_producer
        self.h3 = h3_service

    # -------------------------------------------------------------------------
    # Report creation
    # -------------------------------------------------------------------------

    async def create_report(
        self,
        user_id: str,
        report_type: str,
        lat: float,
        lng: float,
        description: str | None = None,
        extra_data: dict | None = None,
    ) -> dict:
        """
        Create a crowdsource report or increment confidence of a nearby duplicate.

        Steps:
        1. Validate report type
        2. Compute H3 index (res 9) for spatial grouping
        3. Check for nearby duplicate (same type, same H3 cell, last DUP_WINDOW_MINUTES)
        4. If duplicate found → increment confidence_score, return existing
        5. Compute expires_at from REPORT_TTL_SECONDS
        6. INSERT INTO nav_crowdsource_reports
        7. Update reporter reputation counter
        8. Publish to Kafka
        9. Broadcast nearby via Redis pub/sub
        10. Return report dict
        """
        if report_type not in VALID_REPORT_TYPES:
            raise ValidationError(
                f"Unknown report type: {report_type!r}",
                detail={"valid_types": sorted(VALID_REPORT_TYPES)},
            )

        h3_index = self.h3.latlng_to_h3(lat, lng, resolution=9)
        now = datetime.now(timezone.utc)
        dup_window_start = now - timedelta(minutes=DUP_WINDOW_MINUTES)

        # Duplicate detection within same H3 cell
        existing = await self.db.fetch_one(
            """
            SELECT id, confidence_score
            FROM nav_crowdsource_reports
            WHERE report_type = $1
              AND h3_index_r9 = $2
              AND status IN ('submitted', 'verified', 'active')
              AND created_at >= $3
            ORDER BY created_at DESC
            LIMIT 1
            """,
            report_type,
            h3_index,
            dup_window_start,
        )

        if existing is not None:
            # Increment confidence of existing report
            updated = await self.db.fetch_one(
                """
                UPDATE nav_crowdsource_reports
                   SET confidence_score = confidence_score + 1,
                       updated_at = now()
                 WHERE id = $1
                RETURNING id, report_type, confidence_score, status, created_at
                """,
                existing["id"],
            )
            logger.info(
                "crowdsource.duplicate_merged",
                report_id=str(existing["id"]),
                user_id=user_id,
                report_type=report_type,
            )
            return {**dict(updated), "duplicate": True}

        # Compute TTL
        ttl_s = REPORT_TTL_SECONDS.get(report_type)
        expires_at: datetime | None = None
        if ttl_s and ttl_s < 86400 * 365 * 10:  # Skip pseudo-permanent entries
            expires_at = now + timedelta(seconds=ttl_s)

        report_id = uuid.uuid4()

        await self.db.execute_query(
            """
            INSERT INTO nav_crowdsource_reports (
                id, reporter_id, report_type,
                location, h3_index_r9,
                description, extra_data,
                status, confidence_score,
                upvotes, downvotes,
                expires_at, created_at, updated_at
            ) VALUES (
                $1, $2, $3,
                ST_SetSRID(ST_MakePoint($4, $5), 4326), $6,
                $7, $8,
                'submitted', 1,
                0, 0,
                $9, now(), now()
            )
            """,
            report_id,
            str(user_id),
            report_type,
            lng,        # ST_MakePoint(lng, lat)
            lat,
            h3_index,
            description,
            extra_data,
            expires_at,
        )

        # Increment reporter's total_reports counter (best-effort)
        try:
            await self.db.execute_query(
                """
                UPDATE nav_reporter_reputations
                   SET total_reports = total_reports + 1,
                       updated_at = now()
                 WHERE user_id = $1
                """,
                str(user_id),
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("crowdsource.reputation_update_failed", user_id=user_id, error=str(exc))

        report_dict = {
            "id": str(report_id),
            "reporter_id": str(user_id),
            "report_type": report_type,
            "lat": lat,
            "lng": lng,
            "h3_r9": h3_index,
            "description": description,
            "status": "submitted",
            "confidence_score": 1,
            "upvotes": 0,
            "downvotes": 0,
            "expires_at": expires_at.isoformat() if expires_at else None,
            "created_at": now.isoformat(),
            "duplicate": False,
        }

        # Kafka publish (non-blocking intent)
        try:
            await self.kafka.produce_event(
                topic=KAFKA_TOPIC_REPORTS,
                key=str(report_id),
                value=report_dict,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("crowdsource.kafka_publish_failed", report_id=str(report_id), error=str(exc))

        # Redis pub/sub broadcast to nearby subscribers (channel keyed by H3 cell)
        pub_channel = f"reports:{h3_index}"
        try:
            await self.redis.publish(pub_channel, report_dict)
        except Exception as exc:  # noqa: BLE001
            logger.warning("crowdsource.pubsub_failed", channel=pub_channel, error=str(exc))

        logger.info(
            "crowdsource.report_created",
            report_id=str(report_id),
            report_type=report_type,
            user_id=user_id,
            h3_r9=h3_index,
        )
        return report_dict

    # -------------------------------------------------------------------------
    # Voting
    # -------------------------------------------------------------------------

    async def vote_on_report(
        self, user_id: str, report_id: str, vote_type: str
    ) -> dict:
        """
        Record a vote on a report.

        1. Validate vote_type
        2. Fetch report — 404 if not found
        3. Block self-voting
        4. Check idempotency: user already voted this report → ConflictError
        5. INSERT INTO nav_report_votes (idempotency key = user_id + report_id)
        6. UPDATE upvotes/downvotes counter
        7. Check verification/rejection thresholds → update status if crossed
        8. Update reporter reputation (+1 for verify, -1 for reject transition)
        9. Return updated report summary
        """
        if vote_type not in VALID_VOTE_TYPES:
            raise ValidationError(
                f"Invalid vote type: {vote_type!r}",
                detail={"valid": list(VALID_VOTE_TYPES)},
            )

        report = await self.db.fetch_one(
            """
            SELECT id, reporter_id, report_type, status, upvotes, downvotes
            FROM nav_crowdsource_reports
            WHERE id = $1
            """,
            uuid.UUID(report_id),
        )
        if report is None:
            raise NotFoundError(f"Report {report_id} not found")

        if str(report["reporter_id"]) == str(user_id):
            raise ValidationError(
                "Cannot vote on your own report",
                detail={"report_id": report_id},
            )

        # Idempotency check
        existing_vote = await self.db.fetch_one(
            """
            SELECT id FROM nav_report_votes
            WHERE report_id = $1 AND voter_id = $2
            """,
            uuid.UUID(report_id),
            str(user_id),
        )
        if existing_vote is not None:
            raise ConflictError(
                "You have already voted on this report",
                detail={"report_id": report_id},
            )

        # Insert vote
        await self.db.execute_query(
            """
            INSERT INTO nav_report_votes (report_id, voter_id, vote_type, created_at)
            VALUES ($1, $2, $3, now())
            """,
            uuid.UUID(report_id),
            str(user_id),
            vote_type,
        )

        # Update counters with static SQL only (no dynamic field interpolation).
        if vote_type == "upvote":
            updated = await self.db.fetch_one(
                """
                UPDATE nav_crowdsource_reports
                   SET upvotes = upvotes + 1,
                       updated_at = now()
                 WHERE id = $1
                RETURNING id, status, upvotes, downvotes, reporter_id
                """,
                uuid.UUID(report_id),
            )
        else:
            updated = await self.db.fetch_one(
                """
                UPDATE nav_crowdsource_reports
                   SET downvotes = downvotes + 1,
                       updated_at = now()
                 WHERE id = $1
                RETURNING id, status, upvotes, downvotes, reporter_id
                """,
                uuid.UUID(report_id),
            )

        new_upvotes = updated["upvotes"]
        new_downvotes = updated["downvotes"]
        net_votes = new_upvotes - new_downvotes
        current_status = updated["status"]
        new_status = current_status

        # Threshold evaluation
        if current_status not in ("verified", "rejected", "expired"):
            if new_upvotes >= VERIFY_THRESHOLD:
                new_status = "verified"
            elif net_votes <= REJECT_THRESHOLD:
                new_status = "rejected"

        if new_status != current_status:
            await self.db.execute_query(
                """
                UPDATE nav_crowdsource_reports
                   SET status = $1, updated_at = now()
                 WHERE id = $2
                """,
                new_status,
                uuid.UUID(report_id),
            )

            # Reputation delta for original reporter
            rep_delta = 1 if new_status == "verified" else -1
            try:
                await self.db.execute_query(
                    """
                    UPDATE nav_reporter_reputations
                       SET reputation_score = reputation_score + $1,
                           updated_at = now()
                     WHERE user_id = $2
                    """,
                    rep_delta,
                    str(updated["reporter_id"]),
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "crowdsource.reputation_update_failed",
                    reporter_id=str(updated["reporter_id"]),
                    error=str(exc),
                )

            logger.info(
                "crowdsource.status_changed",
                report_id=report_id,
                from_status=current_status,
                to_status=new_status,
                net_votes=net_votes,
            )

        return {
            "report_id": report_id,
            "vote_type": vote_type,
            "status": new_status,
            "upvotes": new_upvotes,
            "downvotes": new_downvotes,
            "net_votes": net_votes,
        }

    # -------------------------------------------------------------------------
    # Spatial queries
    # -------------------------------------------------------------------------

    async def get_nearby_reports(
        self,
        lat: float,
        lng: float,
        radius_m: int = 5000,
        report_types: list[str] | None = None,
        limit: int = 50,
    ) -> list[dict]:
        """
        Fetch active reports within radius_m metres using PostGIS ST_DWithin.

        ST_DWithin uses the geography type (metres), so SRID must be 4326.
        Result ordered by created_at DESC (most recent first).
        Expired and rejected reports are excluded.
        """
        if limit > 200:
            limit = 200

        report_types_filter: list[str] | None = None

        if report_types:
            # Validate each type
            invalid = [t for t in report_types if t not in VALID_REPORT_TYPES]
            if invalid:
                raise ValidationError(
                    f"Invalid report types: {invalid}",
                    detail={"valid": sorted(VALID_REPORT_TYPES)},
                )
            report_types_filter = report_types

        rows = await self.db.fetch_all(
            """
            SELECT
                id,
                reporter_id,
                report_type,
                ST_Y(location::geometry) AS lat,
                ST_X(location::geometry) AS lng,
                h3_index_r9,
                description,
                status,
                confidence_score,
                upvotes,
                downvotes,
                expires_at,
                created_at,
                ST_Distance(
                    location::geography,
                    ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
                ) AS distance_m
            FROM nav_crowdsource_reports
            WHERE ST_DWithin(
                location::geography,
                ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                $3
            )
              AND status IN ('submitted', 'verified', 'active')
              AND (expires_at IS NULL OR expires_at > now())
                            AND ($5::text[] IS NULL OR report_type = ANY($5::text[]))
            ORDER BY created_at DESC
            LIMIT $4
            """,
                        lng,
                        lat,
                        radius_m,
                        limit,
                        report_types_filter,
        )
        return [dict(r) for r in rows]

    async def get_report(self, report_id: str) -> dict:
        """Fetch single report by ID. Raises NotFoundError if absent."""
        row = await self.db.fetch_one(
            """
            SELECT
                id,
                reporter_id,
                report_type,
                ST_Y(location::geometry) AS lat,
                ST_X(location::geometry) AS lng,
                h3_index_r9,
                description,
                extra_data,
                status,
                confidence_score,
                upvotes,
                downvotes,
                expires_at,
                created_at,
                updated_at
            FROM nav_crowdsource_reports
            WHERE id = $1
            """,
            uuid.UUID(report_id),
        )
        if row is None:
            raise NotFoundError(f"Report {report_id} not found")
        return dict(row)

    async def get_report_heatmap(
        self,
        bbox: BBox,
        report_type: str | None = None,
        resolution: int = 8,
    ) -> list[dict]:
        """
        Generate heatmap data: aggregate report counts per H3 cell within bbox.

        Uses h3_index_r9 stored on each row; re-parents to requested resolution.
        Returns list of {h3_index, count, lat, lng} for map rendering.
        """
        if report_type is not None and report_type not in VALID_REPORT_TYPES:
            raise ValidationError(
                f"Invalid report type: {report_type!r}",
                detail={"valid": sorted(VALID_REPORT_TYPES)},
            )

        rows = await self.db.fetch_all(
            """
            SELECT
                h3_index_r9,
                count(*) AS report_count
            FROM nav_crowdsource_reports
            WHERE ST_Within(
                location::geometry,
                ST_MakeEnvelope($1, $2, $3, $4, 4326)
            )
              AND status IN ('submitted', 'verified', 'active')
              AND (expires_at IS NULL OR expires_at > now())
                            AND ($5::text IS NULL OR report_type = $5::text)
            GROUP BY h3_index_r9
            ORDER BY report_count DESC
            LIMIT 500
            """,
                        bbox.min_lng,
                        bbox.min_lat,
                        bbox.max_lng,
                        bbox.max_lat,
                        report_type,
        )

        result = []
        for row in rows:
            h3_r9: str = row["h3_index_r9"]
            try:
                parent_cell = self.h3.parent(h3_r9, resolution)
                centroid_lat, centroid_lng = self.h3.h3_to_latlng(parent_cell)
            except Exception as exc:  # noqa: BLE001
                # Fallback to bbox center to avoid persisting/returning NULL-island coordinates.
                centroid_lat = (bbox.min_lat + bbox.max_lat) / 2
                centroid_lng = (bbox.min_lng + bbox.max_lng) / 2
                parent_cell = h3_r9
                logger.warning(
                    "crowdsource.heatmap_h3_parent_failed",
                    h3_index_r9=h3_r9,
                    resolution=resolution,
                    error=str(exc),
                )

            result.append({
                "h3_index": parent_cell,
                "count": row["report_count"],
                "lat": centroid_lat,
                "lng": centroid_lng,
            })

        return result

    # -------------------------------------------------------------------------
    # Maintenance
    # -------------------------------------------------------------------------

    async def expire_old_reports(self) -> int:
        """
        Periodic maintenance: mark reports as 'expired' when past their TTL.
        Called by a background task every 5 minutes.

        Returns count of newly expired rows.
        Uses a single UPDATE with RETURNING to avoid race conditions.
        """
        result = await self.db.fetch_all(
            """
            UPDATE nav_crowdsource_reports
               SET status = 'expired', updated_at = now()
             WHERE expires_at IS NOT NULL
               AND expires_at <= now()
               AND status NOT IN ('expired', 'rejected', 'deleted')
            RETURNING id, report_type
            """,
        )
        count = len(result) if result else 0
        if count:
            logger.info("crowdsource.reports_expired", count=count)
        return count
