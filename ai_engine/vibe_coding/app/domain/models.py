"""Domain models — pure Python, zero framework dependencies.

These are the core business entities. They must never import from SQLAlchemy,
FastAPI, Pydantic, or any infrastructure library. This boundary guarantees
the domain can be tested in isolation and migrated to a different stack.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from uuid import UUID, uuid4


# ── Enums ────────────────────────────────────────────────────────────────────

class TaskStatus(str, Enum):
    """Lifecycle states of a task.

    State machine: TODO → IN_PROGRESS → DONE | CANCELLED
    BLOCKED is a valid intermediate state from IN_PROGRESS.
    """
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    DONE = "done"
    CANCELLED = "cancelled"


class TaskPriority(str, Enum):
    """Task urgency levels, ordered by severity."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class UserRole(str, Enum):
    """RBAC roles. Permissions are additive (ADMIN ⊃ MEMBER ⊃ VIEWER)."""
    VIEWER = "viewer"
    MEMBER = "member"
    ADMIN = "admin"


# ── Value Objects ─────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Email:
    """Validated email address value object.

    Immutable by design — equality is structural (value-based).
    """
    value: str

    def __post_init__(self) -> None:
        """Validate email format on construction."""
        pattern = r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$"
        if not re.match(pattern, self.value):
            raise ValueError(f"Invalid email address: {self.value!r}")

    def __str__(self) -> str:
        return self.value


@dataclass(frozen=True)
class TaskId:
    """Strongly-typed task identifier value object."""
    value: UUID

    @classmethod
    def generate(cls) -> "TaskId":
        """Generate a new random TaskId."""
        return cls(value=uuid4())

    def __str__(self) -> str:
        return str(self.value)


# ── Aggregate Roots ───────────────────────────────────────────────────────────

@dataclass
class User:
    """User aggregate root.

    Represents an authenticated principal with a role. The password hash
    is stored here for domain logic but must never be serialized to clients.
    """
    id: UUID
    email: Email
    name: str
    role: UserRole
    password_hash: str
    created_at: datetime
    is_active: bool = True

    def deactivate(self) -> None:
        """Deactivate user account. Idempotent."""
        self.is_active = False

    def has_role(self, required: UserRole) -> bool:
        """Check if user holds at least the required role level."""
        hierarchy = [UserRole.VIEWER, UserRole.MEMBER, UserRole.ADMIN]
        return hierarchy.index(self.role) >= hierarchy.index(required)


@dataclass
class Project:
    """Project aggregate root. Groups tasks under a named context."""
    id: UUID
    name: str
    owner_id: UUID
    created_at: datetime
    description: str = ""


@dataclass
class Task:
    """Task aggregate root — the primary business entity.

    Enforces invariants: status transitions are validated, title is non-empty.
    """
    id: UUID
    title: str
    project_id: UUID
    creator_id: UUID
    status: TaskStatus
    priority: TaskPriority
    created_at: datetime
    updated_at: datetime
    description: str = ""
    assignee_id: UUID | None = None
    due_date: datetime | None = None
    tags: list[str] = field(default_factory=list)

    _VALID_TRANSITIONS: dict[TaskStatus, set[TaskStatus]] = field(
        default_factory=lambda: {
            TaskStatus.TODO: {TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED},
            TaskStatus.IN_PROGRESS: {TaskStatus.BLOCKED, TaskStatus.DONE, TaskStatus.CANCELLED},
            TaskStatus.BLOCKED: {TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED},
            TaskStatus.DONE: set(),
            TaskStatus.CANCELLED: set(),
        },
        repr=False,
        compare=False,
    )

    def __post_init__(self) -> None:
        """Validate invariants after construction."""
        if not self.title or not self.title.strip():
            raise ValueError("Task title must not be empty")
        if len(self.title) > 255:
            raise ValueError("Task title must be 255 characters or fewer")

    def transition_to(self, new_status: TaskStatus) -> None:
        """Transition task to a new status, enforcing the state machine.

        Args:
            new_status: The target status.

        Raises:
            ValueError: If the transition is not allowed from the current status.
        """
        allowed = self._VALID_TRANSITIONS.get(self.status, set())
        if new_status not in allowed:
            raise ValueError(
                f"Cannot transition task from {self.status.value!r} to {new_status.value!r}. "
                f"Allowed transitions: {[s.value for s in allowed]}"
            )
        self.status = new_status
        self.updated_at = datetime.utcnow()

    def assign_to(self, user_id: UUID) -> None:
        """Assign task to a user. Only possible when task is not DONE/CANCELLED."""
        if self.status in {TaskStatus.DONE, TaskStatus.CANCELLED}:
            raise ValueError("Cannot assign a completed or cancelled task")
        self.assignee_id = user_id
        self.updated_at = datetime.utcnow()

    def complete(self) -> None:
        """Mark task as DONE. Enforces valid state transition."""
        self.transition_to(TaskStatus.DONE)
