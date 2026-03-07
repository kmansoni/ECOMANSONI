"""
Navigation Server — Risk / Anti-Fraud Admin API Router.

Endpoints (all require role=admin):
  GET  /api/v1/nav/risk/{actor_id}                     — risk score
  POST /api/v1/nav/risk/{actor_id}/enforce              — manual enforcement
  GET  /api/v1/nav/risk/{actor_id}/events               — risk events history
  GET  /api/v1/nav/risk/{actor_id}/enforcement-history  — enforcement actions log

Security:
  - All endpoints require role='admin' (validated from signed JWT claim).
  - actor_id from URL path; admin cannot spoof their own actor_id into the path
    because their JWT role is 'admin', not the actor's ID.
  - enforcement level transitions validated in RiskService (no skip-to-banned
    without explicit justification).
  - Audit log: every enforce action is persisted to nav_enforcement_actions
    with performed_by set to admin's user_id from JWT.
  - No bulk endpoints exposed — prevents mass enforcement DoS.

Rate limits (enforced at API gateway):
  POST /enforce: 10 req/min per admin (prevent accidental mass-enforcement)
"""
from __future__ import annotations

from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from auth import CurrentUser, require_role
from database import get_pool
from kafka_client import get_kafka_producer
from redis_client import get_redis_client
from services.h3_service import H3Service
from services.risk_service import RiskService

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/nav/risk", tags=["risk"])

_h3 = H3Service()

VALID_ENFORCEMENT_LEVELS = frozenset(
    ["observe", "soft_throttle", "hard_throttle", "suspended", "banned"]
)


def _get_risk_service() -> RiskService:
    return RiskService(
        db_pool=get_pool(),
        redis=get_redis_client(),
        kafka=get_kafka_producer(),
        h3_service=_h3,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Request / Response schemas
# ─────────────────────────────────────────────────────────────────────────────

class EnforceRequest(BaseModel):
    level: str = Field(..., description="Target enforcement level")
    reason: str = Field(..., min_length=5, max_length=1000, description="Mandatory justification")
    duration_hours: int | None = Field(
        default=None,
        ge=1,
        le=720,
        description="Optional expiry in hours (max 30 days). Not applicable for 'banned'.",
    )


# ─────────────────────────────────────────────────────────────────────────────

@router.get("/{actor_id}", summary="Get risk score for actor")
async def get_risk(
    actor_id: str,
    admin: Annotated[CurrentUser, Depends(require_role("admin"))],
    svc: RiskService = Depends(_get_risk_service),
) -> dict:
    """
    Returns current risk score, risk types, confidence, and enforcement state.
    Returns 404 if actor has no risk record.
    """
    record = await svc.get_risk_score(actor_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No risk record found for actor {actor_id!r}",
        )

    enforcement = await svc.check_enforcement(actor_id)
    return {
        "success": True,
        "actor_id": actor_id,
        "risk": record,
        "enforcement": enforcement,
    }


@router.post("/{actor_id}/enforce", summary="Apply manual enforcement action")
async def enforce_action(
    actor_id: str,
    body: EnforceRequest,
    admin: Annotated[CurrentUser, Depends(require_role("admin"))],
    svc: RiskService = Depends(_get_risk_service),
) -> dict:
    """
    Apply a manual enforcement action to an actor.

    Level transition rules:
    - Escalation (to higher level): always allowed for admin.
    - Reduction (to lower level): allowed for admin (performed_by set to admin user_id).
    - 'banned' enforcement has no expiry by default; duration_hours is ignored.

    All actions are persisted to nav_enforcement_actions audit log.
    """
    if body.level not in VALID_ENFORCEMENT_LEVELS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid level {body.level!r}. Valid: {sorted(VALID_ENFORCEMENT_LEVELS)}",
        )

    result = await svc.enforce(
        actor_id=actor_id,
        new_level=body.level,
        reason=body.reason,
        performed_by=admin.user_id,
        duration_hours=body.duration_hours,
    )

    logger.info(
        "risk.manual_enforcement",
        actor_id=actor_id,
        admin_id=admin.user_id,
        new_level=body.level,
        applied=result.get("applied"),
    )
    return {
        "success": True,
        **result,
    }


@router.get("/{actor_id}/events", summary="Risk events history")
async def risk_events(
    actor_id: str,
    admin: Annotated[CurrentUser, Depends(require_role("admin"))],
    svc: RiskService = Depends(_get_risk_service),
    limit: int = Query(50, ge=1, le=200),
) -> dict:
    """
    Returns paginated risk events for an actor, ordered by recency.
    """
    events = await svc.get_risk_events(actor_id=actor_id, limit=limit)
    return {
        "success": True,
        "actor_id": actor_id,
        "count": len(events),
        "events": events,
    }


@router.get("/{actor_id}/enforcement-history", summary="Enforcement actions history")
async def enforcement_history(
    actor_id: str,
    admin: Annotated[CurrentUser, Depends(require_role("admin"))],
    svc: RiskService = Depends(_get_risk_service),
) -> dict:
    """
    Returns the full enforcement action audit trail for an actor.
    """
    history = await svc.get_enforcement_history(actor_id=actor_id)
    return {
        "success": True,
        "actor_id": actor_id,
        "count": len(history),
        "history": history,
    }
