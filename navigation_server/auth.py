"""
Navigation Server — Authentication & Authorisation
Zero-trust: every request must carry a valid Supabase JWT or SDK API key.

Attack surface mitigated:
- Replay: JWT `exp` + `nbf` enforced with leeway
- Algorithm confusion: only HS256 accepted (Supabase default)
- Timing-safe API key comparison via hmac.compare_digest
- Role escalation: role read from signed JWT claims, never from user-supplied headers
"""
from __future__ import annotations

import hmac
import time
from typing import Annotated

import structlog
from fastapi import Depends, Header, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import ExpiredSignatureError, JWTError, jwt
from jose.exceptions import JWTClaimsError

from config import get_settings
from exceptions import AuthError, ForbiddenError

logger = structlog.get_logger(__name__)

bearer_scheme = HTTPBearer(auto_error=False)


class CurrentUser:
    """Parsed JWT principal."""

    __slots__ = ("user_id", "role", "email", "app_metadata")

    def __init__(
        self,
        user_id: str,
        role: str,
        email: str | None = None,
        app_metadata: dict | None = None,
    ) -> None:
        self.user_id = user_id
        self.role = role
        self.email = email
        self.app_metadata = app_metadata or {}


def _verify_jwt(token: str) -> dict:
    """
    Verify and decode a Supabase JWT.
    Raises AuthError on any failure — caller maps to HTTP 401.
    """
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            audience=settings.JWT_AUDIENCE,
            options={
                "leeway": settings.JWT_LEEWAY_SECONDS,
                "verify_exp": True,
                "verify_nbf": True,
                "verify_iat": True,
                "verify_aud": True,
            },
        )
        return payload
    except ExpiredSignatureError:
        raise AuthError("Token has expired")
    except JWTClaimsError as exc:
        raise AuthError(f"Invalid token claims: {exc}")
    except JWTError as exc:
        raise AuthError(f"Token verification failed: {exc}")


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    x_api_key: Annotated[str | None, Header(alias="X-Api-Key")] = None,
) -> CurrentUser:
    """
    FastAPI dependency — returns CurrentUser from JWT or SDK API key.

    Priority:
    1. Bearer JWT (Supabase auth)
    2. X-Api-Key header (SDK / server-to-server)

    Both paths raise HTTP 401 on failure; no fallback to anonymous.
    """
    settings = get_settings()

    # ── Path 1: Bearer JWT ────────────────────────────────────────────────────
    if credentials is not None:
        try:
            payload = _verify_jwt(credentials.credentials)
        except AuthError as exc:
            logger.warning("auth.jwt_rejected", reason=str(exc))
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=str(exc),
                headers={"WWW-Authenticate": "Bearer"},
            )

        user_id: str | None = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="JWT missing 'sub' claim",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Supabase stores roles in app_metadata.roles or top-level role claim
        app_metadata: dict = payload.get("app_metadata", {})
        role: str = (
            app_metadata.get("role")
            or payload.get("role")
            or "user"
        )

        return CurrentUser(
            user_id=user_id,
            role=role,
            email=payload.get("email"),
            app_metadata=app_metadata,
        )

    # ── Path 2: SDK API Key ───────────────────────────────────────────────────
    if x_api_key is not None:
        valid_keys = settings.sdk_api_keys_set
        # Constant-time comparison to prevent timing oracle
        if not any(
            hmac.compare_digest(x_api_key.encode(), k.encode())
            for k in valid_keys
        ):
            logger.warning("auth.api_key_rejected")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid API key",
            )
        # SDK keys are server-to-server; grant admin role
        return CurrentUser(user_id="sdk", role="admin")

    # ── No credentials ────────────────────────────────────────────────────────
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required",
        headers={"WWW-Authenticate": "Bearer"},
    )


def require_role(*allowed_roles: str):
    """
    Returns a FastAPI dependency that enforces role membership.

    Usage:
        @router.post("/admin", dependencies=[Depends(require_role("admin"))])
    """
    async def _check(user: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
        if user.role not in allowed_roles:
            logger.warning(
                "auth.forbidden",
                user_id=user.user_id,
                user_role=user.role,
                required=allowed_roles,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user.role}' is not permitted. Required: {list(allowed_roles)}",
            )
        return user

    return _check
