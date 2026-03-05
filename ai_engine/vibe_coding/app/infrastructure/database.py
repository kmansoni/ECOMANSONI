"""SQLAlchemy ORM models and async session factory.

ORM models are INFRASTRUCTURE concerns. They mirror the domain models but
are optimized for relational persistence. The mapping between domain and
ORM is explicit (no magic inheritance from Base in domain objects).

Connection pool settings are tuned for production use:
- pool_pre_ping: detects stale connections before checkout
- pool_recycle: prevents connections older than 1 hour
- max_overflow: additional connections beyond pool_size under load spike
"""

from __future__ import annotations

from datetime import datetime
from typing import AsyncGenerator
from uuid import UUID

from sqlalchemy import (
    ARRAY,
    Boolean,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from app.domain.models import TaskPriority, TaskStatus, UserRole


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""
    pass


# ── ORM Models ────────────────────────────────────────────────────────────────

class UserModel(Base):
    """Relational mapping for User aggregate."""

    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("email", name="uq_users_email"),
        Index("ix_users_email", "email"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    email: Mapped[str] = mapped_column(String(254), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole, name="user_role"), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now()
    )

    tasks_created: Mapped[list["TaskModel"]] = relationship(
        "TaskModel", foreign_keys="TaskModel.creator_id", back_populates="creator"
    )
    tasks_assigned: Mapped[list["TaskModel"]] = relationship(
        "TaskModel", foreign_keys="TaskModel.assignee_id", back_populates="assignee"
    )


class ProjectModel(Base):
    """Relational mapping for Project aggregate."""

    __tablename__ = "projects"
    __table_args__ = (Index("ix_projects_owner_id", "owner_id"),)

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    owner_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now()
    )

    tasks: Mapped[list["TaskModel"]] = relationship("TaskModel", back_populates="project")


class TaskModel(Base):
    """Relational mapping for Task aggregate.

    Composite index on (project_id, status, created_at) covers the most
    common query pattern: "tasks in project X with status Y sorted by date".
    """

    __tablename__ = "tasks"
    __table_args__ = (
        Index("ix_tasks_project_status_created", "project_id", "status", "created_at"),
        Index("ix_tasks_assignee_id", "assignee_id"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[TaskStatus] = mapped_column(
        SAEnum(TaskStatus, name="task_status"), nullable=False, default=TaskStatus.TODO
    )
    priority: Mapped[TaskPriority] = mapped_column(
        SAEnum(TaskPriority, name="task_priority"), nullable=False
    )
    project_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    creator_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=False
    )
    assignee_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), nullable=True)
    tags: Mapped[list[str]] = mapped_column(ARRAY(String(50)), nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    project: Mapped["ProjectModel"] = relationship("ProjectModel", back_populates="tasks")
    creator: Mapped["UserModel"] = relationship(
        "UserModel", foreign_keys=[creator_id], back_populates="tasks_created"
    )
    assignee: Mapped["UserModel | None"] = relationship(
        "UserModel", foreign_keys=[assignee_id], back_populates="tasks_assigned"
    )


# ── Session Factory ───────────────────────────────────────────────────────────

def create_engine(database_url: str, echo: bool = False) -> AsyncEngine:
    """Create configured async SQLAlchemy engine.

    Args:
        database_url: Async PostgreSQL DSN (postgresql+asyncpg://...).
        echo: Whether to log all SQL (development only).
    """
    return create_async_engine(
        database_url,
        echo=echo,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
        pool_recycle=3600,
        connect_args={"server_settings": {"application_name": "task-api"}},
    )


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Create an async session factory bound to the given engine."""
    return async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
        autocommit=False,
    )


async def get_session(
    session_factory: async_sessionmaker[AsyncSession],
) -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields a database session per request.

    The session is committed on success and rolled back on exception.
    This prevents partial writes from leaking into subsequent requests.
    """
    async with session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
