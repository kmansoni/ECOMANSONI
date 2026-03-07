"""
Navigation Server — Domain Exceptions
All exceptions map to deterministic HTTP status codes via handlers in main.py.
"""
from __future__ import annotations


class NavigationBaseError(Exception):
    """Base for all navigation-server exceptions."""

    status_code: int = 500
    error_code: str = "INTERNAL_ERROR"

    def __init__(self, message: str, *, detail: dict | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.detail = detail or {}


class GeoError(NavigationBaseError):
    """Raised when a geo-spatial operation fails (invalid geometry, out-of-bounds, etc.)."""

    status_code = 422
    error_code = "GEO_ERROR"


class RoutingError(NavigationBaseError):
    """Raised when Valhalla cannot compute a route."""

    status_code = 422
    error_code = "ROUTING_ERROR"


class GeocodingError(NavigationBaseError):
    """Raised when Photon / geocoder returns an unexpected response."""

    status_code = 502
    error_code = "GEOCODING_ERROR"


class AuthError(NavigationBaseError):
    """Raised on JWT / API-key verification failure."""

    status_code = 401
    error_code = "AUTH_ERROR"


class ForbiddenError(NavigationBaseError):
    """Raised when the verified user lacks required role."""

    status_code = 403
    error_code = "FORBIDDEN"


class NotFoundError(NavigationBaseError):
    """Raised when a requested resource does not exist."""

    status_code = 404
    error_code = "NOT_FOUND"


class ConflictError(NavigationBaseError):
    """Raised on idempotency key collision or state conflict."""

    status_code = 409
    error_code = "CONFLICT"


class UpstreamError(NavigationBaseError):
    """Raised when an upstream service (Valhalla, Photon, …) returns 5xx."""

    status_code = 502
    error_code = "UPSTREAM_ERROR"


class RateLimitError(NavigationBaseError):
    """Raised when the request rate exceeds configured limits."""

    status_code = 429
    error_code = "RATE_LIMITED"
