"""Security infrastructure — JWT tokens, password hashing, RBAC enforcement.

Security principles applied:
1. Passwords are hashed with bcrypt (cost factor 12 by default).
2. JWT uses HS256 (configurable to RS256 in production via key file).
3. Tokens carry `jti` (JWT ID) for blacklisting on logout.
4. Token expiry is enforced server-side; clients cannot extend tokens.
5. RBAC checks are pure functions — no I/O, fully testable.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import bcrypt
import jwt
from jwt.exceptions import DecodeError, ExpiredSignatureError, InvalidTokenError

from app.application.services import PasswordHasher
from app.domain.exceptions import AuthorizationError, ValidationError
from app.domain.models import UserRole


# ── JWT Token Payload ─────────────────────────────────────────────────────────

class TokenPayload:
    """Parsed and validated JWT payload.

    Attributes:
        user_id: Subject (user UUID).
        role: User's role at token issuance time.
        jti: Unique JWT ID for blacklisting.
        exp: Expiry as UTC datetime.
    """

    __slots__ = ("user_id", "role", "jti", "exp")

    def __init__(self, user_id: UUID, role: UserRole, jti: str, exp: datetime) -> None:
        self.user_id = user_id
        self.role = role
        self.jti = jti
        self.exp = exp


# ── JWT Service ───────────────────────────────────────────────────────────────

class JWTService:
    """Handles JWT creation and verification.

    Thread-safe: all methods are stateless (no instance state mutated).
    """

    def __init__(self, secret_key: str, algorithm: str, access_expire_minutes: int) -> None:
        self._secret = secret_key
        self._algorithm = algorithm
        self._access_ttl = timedelta(minutes=access_expire_minutes)

    def create_access_token(self, user_id: UUID, role: UserRole) -> tuple[str, str]:
        """Create a signed access token.

        Args:
            user_id: Authenticated user's UUID.
            role: User's current role (embedded in token for stateless RBAC).

        Returns:
            Tuple of (encoded JWT string, jti claim for blacklisting).
        """
        jti = secrets.token_hex(16)
        now = datetime.now(timezone.utc)
        payload = {
            "sub": str(user_id),
            "role": role.value,
            "jti": jti,
            "iat": now,
            "exp": now + self._access_ttl,
        }
        token = jwt.encode(payload, self._secret, algorithm=self._algorithm)
        return token, jti

    def verify_access_token(self, token: str) -> TokenPayload:
        """Verify and decode an access token.

        Args:
            token: Raw JWT string from Authorization header.

        Returns:
            Parsed TokenPayload.

        Raises:
            ValidationError: Token is invalid, expired, or malformed.
        """
        try:
            raw = jwt.decode(
                token,
                self._secret,
                algorithms=[self._algorithm],
                options={"require": ["sub", "role", "jti", "exp", "iat"]},
            )
        except ExpiredSignatureError:
            raise ValidationError("Access token has expired", field="authorization")
        except (DecodeError, InvalidTokenError) as exc:
            raise ValidationError(f"Invalid access token: {exc}", field="authorization")

        try:
            return TokenPayload(
                user_id=UUID(raw["sub"]),
                role=UserRole(raw["role"]),
                jti=raw["jti"],
                exp=datetime.fromtimestamp(raw["exp"], tz=timezone.utc),
            )
        except (ValueError, KeyError) as exc:
            raise ValidationError(f"Malformed token payload: {exc}", field="authorization")


# ── Password Hasher ───────────────────────────────────────────────────────────

class BcryptPasswordHasher(PasswordHasher):
    """bcrypt-based password hasher.

    bcrypt is intentionally slow (adaptive cost factor) to resist offline
    brute-force attacks. Never use MD5/SHA1/SHA256 for passwords.
    """

    def __init__(self, rounds: int = 12) -> None:
        self._rounds = rounds

    def hash(self, plain: str) -> str:
        """Hash a plain-text password.

        Args:
            plain: Plain-text password (max 72 bytes for bcrypt).

        Returns:
            bcrypt hash string (includes salt and cost factor).
        """
        encoded = plain.encode("utf-8")
        if len(encoded) > 72:
            # bcrypt silently truncates at 72 bytes; we reject to prevent false positives
            raise ValidationError("Password must be 72 bytes or fewer (UTF-8 encoded)")
        hashed = bcrypt.hashpw(encoded, bcrypt.gensalt(rounds=self._rounds))
        return hashed.decode("utf-8")

    def verify(self, plain: str, hashed: str) -> bool:
        """Verify plain-text password against stored hash.

        Returns:
            True if match, False otherwise. Never raises.
        """
        try:
            return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
        except Exception:
            return False


# ── RBAC enforcement ──────────────────────────────────────────────────────────

def require_role(actor_role: UserRole, required: UserRole, resource: str = "resource") -> None:
    """Assert that the actor holds at least the required role.

    Args:
        actor_role: Role of the current authenticated user.
        required: Minimum required role.
        resource: Human-readable resource name for error messages.

    Raises:
        AuthorizationError: If actor's role is below required.
    """
    hierarchy = [UserRole.VIEWER, UserRole.MEMBER, UserRole.ADMIN]
    if hierarchy.index(actor_role) < hierarchy.index(required):
        raise AuthorizationError(
            action=f"requires {required.value} role",
            resource=resource,
        )


def extract_bearer_token(authorization_header: str | None) -> str:
    """Parse Bearer token from Authorization header value.

    Args:
        authorization_header: Raw header value, e.g. "Bearer eyJ...".

    Returns:
        Raw token string.

    Raises:
        ValidationError: Header is missing or malformed.
    """
    if not authorization_header:
        raise ValidationError("Authorization header is required", field="authorization")
    parts = authorization_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise ValidationError(
            "Authorization header must be 'Bearer <token>'", field="authorization"
        )
    return parts[1]
