"""Domain Exceptions — typed error hierarchy for the business layer.

All exceptions carry enough context to produce meaningful HTTP responses
in the presentation layer, without the domain knowing about HTTP.

Exception hierarchy:
    DomainError
    ├── NotFoundError
    │   ├── TaskNotFoundError
    │   ├── UserNotFoundError
    │   └── ProjectNotFoundError
    ├── ValidationError
    ├── AuthorizationError
    └── DuplicateError
"""

from __future__ import annotations

from uuid import UUID


# ── Base ──────────────────────────────────────────────────────────────────────

class DomainError(Exception):
    """Base class for all domain-layer errors.

    Attributes:
        message: Human-readable error description.
        code: Machine-readable error code for API clients.
    """

    def __init__(self, message: str, code: str = "DOMAIN_ERROR") -> None:
        super().__init__(message)
        self.message = message
        self.code = code

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(code={self.code!r}, message={self.message!r})"


# ── Not Found ─────────────────────────────────────────────────────────────────

class NotFoundError(DomainError):
    """Raised when a requested entity does not exist."""

    def __init__(self, entity: str, entity_id: UUID | str) -> None:
        super().__init__(
            message=f"{entity} with id {entity_id!r} not found",
            code="NOT_FOUND",
        )
        self.entity = entity
        self.entity_id = entity_id


class TaskNotFoundError(NotFoundError):
    """Raised when a task lookup returns no results."""

    def __init__(self, task_id: UUID | str) -> None:
        super().__init__(entity="Task", entity_id=task_id)
        self.code = "TASK_NOT_FOUND"


class UserNotFoundError(NotFoundError):
    """Raised when a user lookup returns no results."""

    def __init__(self, user_id: UUID | str) -> None:
        super().__init__(entity="User", entity_id=user_id)
        self.code = "USER_NOT_FOUND"


class ProjectNotFoundError(NotFoundError):
    """Raised when a project lookup returns no results."""

    def __init__(self, project_id: UUID | str) -> None:
        super().__init__(entity="Project", entity_id=project_id)
        self.code = "PROJECT_NOT_FOUND"


# ── Validation ────────────────────────────────────────────────────────────────

class ValidationError(DomainError):
    """Raised when domain business rule validation fails.

    Distinct from Pydantic ValidationError (schema validation).
    This represents a violated business invariant.
    """

    def __init__(self, message: str, field: str | None = None) -> None:
        super().__init__(message=message, code="VALIDATION_ERROR")
        self.field = field


# ── Authorization ─────────────────────────────────────────────────────────────

class AuthorizationError(DomainError):
    """Raised when a user attempts an action they are not permitted to perform.

    Note: Authentication failure (invalid/expired token) is handled separately
    in the infrastructure/security layer and mapped to HTTP 401.
    This exception maps to HTTP 403 (Forbidden).
    """

    def __init__(self, action: str, resource: str) -> None:
        super().__init__(
            message=f"Not authorized to perform '{action}' on {resource}",
            code="AUTHORIZATION_ERROR",
        )
        self.action = action
        self.resource = resource


# ── Duplicate ─────────────────────────────────────────────────────────────────

class DuplicateError(DomainError):
    """Raised when an entity with the same unique key already exists."""

    def __init__(self, entity: str, field: str, value: str) -> None:
        super().__init__(
            message=f"{entity} with {field}={value!r} already exists",
            code="DUPLICATE_ERROR",
        )
        self.entity = entity
        self.field = field
        self.value = value
