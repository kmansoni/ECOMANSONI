"""Data Transfer Objects — public API contracts using Pydantic v2.

DTOs are the boundary between the HTTP layer and the application layer.
They perform input validation and define the exact shape of API responses.
Domain models are NEVER returned directly from endpoints — always map through DTOs.
"""

from __future__ import annotations

from datetime import datetime
from typing import Generic, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.domain.models import TaskPriority, TaskStatus, UserRole

T = TypeVar("T")


# ── Task DTOs ─────────────────────────────────────────────────────────────────

class CreateTaskRequest(BaseModel):
    """Request body for creating a new task."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "title": "Implement login page",
                "description": "Add email/password login with JWT",
                "priority": "high",
                "project_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
                "due_date": "2025-12-31T23:59:59",
                "tags": ["frontend", "auth"],
            }
        }
    )

    title: str = Field(..., min_length=1, max_length=255, description="Task title")
    description: str = Field(default="", max_length=10_000)
    priority: TaskPriority = Field(default=TaskPriority.MEDIUM)
    project_id: UUID = Field(..., description="Project this task belongs to")
    due_date: datetime | None = Field(default=None)
    tags: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, tags: list[str]) -> list[str]:
        """Ensure each tag is non-empty and max 50 chars."""
        for tag in tags:
            if not tag.strip():
                raise ValueError("Tag must not be empty")
            if len(tag) > 50:
                raise ValueError(f"Tag {tag!r} exceeds 50 characters")
        return [t.strip().lower() for t in tags]


class UpdateTaskRequest(BaseModel):
    """Partial update request — all fields optional (PATCH semantics)."""

    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=10_000)
    priority: TaskPriority | None = None
    status: TaskStatus | None = None
    due_date: datetime | None = None
    tags: list[str] | None = None


class AssignTaskRequest(BaseModel):
    """Request to assign a task to a user."""

    assignee_id: UUID = Field(..., description="User ID to assign the task to")


class TaskResponse(BaseModel):
    """Task representation returned to API clients."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    description: str
    status: TaskStatus
    priority: TaskPriority
    project_id: UUID
    creator_id: UUID
    assignee_id: UUID | None
    due_date: datetime | None
    tags: list[str]
    created_at: datetime
    updated_at: datetime


# ── User DTOs ─────────────────────────────────────────────────────────────────

class CreateUserRequest(BaseModel):
    """Registration request body."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "email": "alice@example.com",
                "name": "Alice Smith",
                "password": "SecureP@ssw0rd!",
            }
        }
    )

    email: EmailStr = Field(..., description="Unique email address")
    name: str = Field(..., min_length=2, max_length=100)
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, password: str) -> str:
        """Require at least one uppercase, one digit, one special character."""
        import re
        if not re.search(r"[A-Z]", password):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"\d", password):
            raise ValueError("Password must contain at least one digit")
        if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
            raise ValueError("Password must contain at least one special character")
        return password


class LoginRequest(BaseModel):
    """Authentication request body."""

    email: EmailStr
    password: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    """JWT token pair response."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = Field(description="Access token lifetime in seconds")


class UserResponse(BaseModel):
    """User profile representation. Never includes password_hash."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    name: str
    role: UserRole
    is_active: bool
    created_at: datetime


# ── Project DTOs ──────────────────────────────────────────────────────────────

class CreateProjectRequest(BaseModel):
    """Project creation request."""

    name: str = Field(..., min_length=1, max_length=100)
    description: str = Field(default="", max_length=2_000)


class ProjectResponse(BaseModel):
    """Project representation returned to API clients."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str
    owner_id: UUID
    created_at: datetime


# ── Generic Pagination ────────────────────────────────────────────────────────

class PaginatedResponse(BaseModel, Generic[T]):
    """Generic paginated response wrapper.

    Uses cursor-based pagination for O(1) page navigation at scale.
    OFFSET pagination is O(N) and breaks under concurrent modifications.
    """

    items: list[T]
    total: int = Field(description="Total number of items matching the filter")
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
    has_next: bool
    has_prev: bool
