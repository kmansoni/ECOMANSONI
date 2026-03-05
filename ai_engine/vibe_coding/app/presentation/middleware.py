"""Presentation layer middleware — cross-cutting concerns for every request.

Middleware is applied in reverse registration order (last registered = first executed).
Order: RateLimitMiddleware → RequestLoggingMiddleware → ErrorHandlingMiddleware → Router

Error hierarchy mapping:
    DomainError subtypes → structured JSON + appropriate HTTP status
    Pydantic ValidationError → 422 (handled by FastAPI natively)
    Unhandled Exception → 500 with sanitized message (no stack trace to client)
"""

from __future__ import annotations

import logging
import time
import uuid
from collections import defaultdict
from typing import Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.domain.exceptions import (
    AuthorizationError,
    DomainError,
    DuplicateError,
    NotFoundError,
    ValidationError,
)

logger = logging.getLogger(__name__)

# ── Status code map ───────────────────────────────────────────────────────────
_DOMAIN_STATUS_MAP: dict[type[DomainError], int] = {
    NotFoundError: 404,
    ValidationError: 422,
    AuthorizationError: 403,
    DuplicateError: 409,
}

REQUEST_ID_HEADER = "X-Request-ID"


# ── Error Handling Middleware ─────────────────────────────────────────────────

class ErrorHandlingMiddleware(BaseHTTPMiddleware):
    """Convert domain exceptions to structured JSON HTTP responses.

    Catches DomainError subclasses and unknown exceptions.
    Unknown exceptions log the full traceback but never expose it to the client.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Wrap request processing with structured error handling."""
        try:
            return await call_next(request)
        except DomainError as exc:
            status = _DOMAIN_STATUS_MAP.get(type(exc), 400)
            # Walk MRO to find closest match
            for cls in type(exc).__mro__:
                if cls in _DOMAIN_STATUS_MAP:
                    status = _DOMAIN_STATUS_MAP[cls]
                    break
            return JSONResponse(
                status_code=status,
                content={
                    "error": {
                        "code": exc.code,
                        "message": exc.message,
                        "request_id": request.state.request_id
                        if hasattr(request.state, "request_id")
                        else None,
                    }
                },
            )
        except Exception as exc:
            logger.exception(
                "unhandled_exception method=%s path=%s error=%s",
                request.method,
                request.url.path,
                str(exc),
            )
            return JSONResponse(
                status_code=500,
                content={
                    "error": {
                        "code": "INTERNAL_ERROR",
                        "message": "An internal error occurred. Please try again later.",
                        "request_id": request.state.request_id
                        if hasattr(request.state, "request_id")
                        else None,
                    }
                },
            )


# ── Request Logging Middleware ────────────────────────────────────────────────

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Structured request/response logging with timing and request ID.

    Each request is assigned a unique ID that flows through all layers
    via request.state.request_id. This enables cross-service tracing.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Log incoming request metadata and response status/latency."""
        request_id = request.headers.get(REQUEST_ID_HEADER) or str(uuid.uuid4())
        request.state.request_id = request_id

        start = time.perf_counter()
        logger.info(
            "request.start method=%s path=%s request_id=%s",
            request.method,
            request.url.path,
            request_id,
        )

        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - start) * 1000

        logger.info(
            "request.end method=%s path=%s status=%d latency_ms=%.2f request_id=%s",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
            request_id,
        )
        response.headers[REQUEST_ID_HEADER] = request_id
        return response


# ── Rate Limiting Middleware ──────────────────────────────────────────────────

class InMemoryRateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding-window rate limiter backed by an in-process dictionary.

    WARNING: This is suitable for single-node deployments only.
    For multi-node production, replace with Redis-backed rate limiting
    (e.g., using `redis-py` with Lua scripts for atomic operations).

    Rate limit key: IP address (X-Forwarded-For or client host).
    """

    def __init__(self, app: ASGIApp, requests_per_minute: int = 60) -> None:
        super().__init__(app)
        self._limit = requests_per_minute
        self._window = 60.0  # seconds
        # {ip: [(timestamp, count), ...]}
        self._counters: dict[str, list[float]] = defaultdict(list)

    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP, respecting reverse proxy X-Forwarded-For."""
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Check rate limit before processing request."""
        # Health/metrics endpoints are exempt
        if request.url.path in {"/health", "/metrics", "/docs", "/openapi.json"}:
            return await call_next(request)

        ip = self._get_client_ip(request)
        now = time.time()
        window_start = now - self._window

        # Prune old timestamps outside the sliding window
        self._counters[ip] = [t for t in self._counters[ip] if t > window_start]

        if len(self._counters[ip]) >= self._limit:
            retry_after = int(self._counters[ip][0] + self._window - now) + 1
            logger.warning("rate_limit.exceeded ip=%s path=%s", ip, request.url.path)
            return JSONResponse(
                status_code=429,
                headers={"Retry-After": str(retry_after)},
                content={
                    "error": {
                        "code": "RATE_LIMIT_EXCEEDED",
                        "message": f"Too many requests. Retry after {retry_after} seconds.",
                    }
                },
            )

        self._counters[ip].append(now)
        return await call_next(request)
