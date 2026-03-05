"""Domain Events — represent facts that happened in the domain.

Events are immutable records of state changes. They are dispatched AFTER
a successful transaction commit to prevent half-published state.

Consumers of these events (notifications, audit log, analytics) must be
idempotent — events can be delivered more than once in case of retries.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID, uuid4


# ── Base Event ────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class DomainEvent:
    """Base class for all domain events.

    Attributes:
        event_id: Unique identifier for deduplication.
        occurred_at: UTC timestamp when the event occurred (not when delivered).
        aggregate_id: ID of the aggregate root that produced this event.
    """
    aggregate_id: UUID
    event_id: UUID = field(default_factory=uuid4)
    occurred_at: datetime = field(default_factory=datetime.utcnow)

    @property
    def event_type(self) -> str:
        """Return the event class name as a string identifier."""
        return self.__class__.__name__


# ── Task Events ───────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class TaskCreated(DomainEvent):
    """Emitted when a new task is created.

    Attributes:
        project_id: Project the task belongs to.
        creator_id: User who created the task.
        title: Task title at creation time.
    """
    project_id: UUID = field(default_factory=uuid4)
    creator_id: UUID = field(default_factory=uuid4)
    title: str = ""


@dataclass(frozen=True)
class TaskUpdated(DomainEvent):
    """Emitted when task fields are modified.

    Attributes:
        changed_fields: Set of field names that were modified.
        updated_by: User who performed the update.
    """
    changed_fields: frozenset[str] = field(default_factory=frozenset)
    updated_by: UUID = field(default_factory=uuid4)


@dataclass(frozen=True)
class TaskAssigned(DomainEvent):
    """Emitted when task is assigned to a user.

    Attributes:
        assignee_id: User the task was assigned to.
        assigned_by: User who performed the assignment.
    """
    assignee_id: UUID = field(default_factory=uuid4)
    assigned_by: UUID = field(default_factory=uuid4)


@dataclass(frozen=True)
class TaskCompleted(DomainEvent):
    """Emitted when task transitions to DONE status.

    Attributes:
        completed_by: User who marked the task as done.
    """
    completed_by: UUID = field(default_factory=uuid4)


@dataclass(frozen=True)
class TaskDeleted(DomainEvent):
    """Emitted when task is permanently deleted.

    Attributes:
        deleted_by: User who performed the deletion.
    """
    deleted_by: UUID = field(default_factory=uuid4)


# ── User Events ───────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class UserRegistered(DomainEvent):
    """Emitted when a new user successfully registers.

    Attributes:
        email: Registered email address.
        role: Initial role assigned to the user.
    """
    email: str = ""
    role: str = "member"


@dataclass(frozen=True)
class UserDeactivated(DomainEvent):
    """Emitted when a user account is deactivated.

    Sessions for this user must be invalidated after this event is processed.

    Attributes:
        deactivated_by: Admin user who performed the action.
    """
    deactivated_by: UUID = field(default_factory=uuid4)
