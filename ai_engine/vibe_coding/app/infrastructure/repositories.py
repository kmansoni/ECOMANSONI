"""SQLAlchemy repository implementations (Adapters).

These classes implement the abstract repository interfaces (Ports) defined in
the application layer. They translate between domain objects and ORM models.

Key invariants:
- Domain objects are NEVER SQLAlchemy instances. Conversion is explicit.
- All queries use parameterized statements (no f-string SQL).
- Pagination uses LIMIT/OFFSET for simplicity; production should use keyset.
- All methods are async-safe: no shared mutable state.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.services import ProjectRepository, TaskRepository, UserRepository
from app.domain.models import Email, Project, Task, TaskPriority, TaskStatus, User, UserRole
from app.infrastructure.database import ProjectModel, TaskModel, UserModel


# ── Mapper helpers ────────────────────────────────────────────────────────────

def _orm_to_user(m: UserModel) -> User:
    """Convert UserModel ORM instance to User domain object."""
    return User(
        id=m.id,
        email=Email(value=m.email),
        name=m.name,
        role=m.role,
        password_hash=m.password_hash,
        is_active=m.is_active,
        created_at=m.created_at,
    )


def _user_to_orm(user: User, existing: UserModel | None = None) -> UserModel:
    """Map User domain object to UserModel. Reuses existing ORM instance to avoid detached-object issues."""
    m = existing or UserModel()
    m.id = user.id
    m.email = str(user.email)
    m.name = user.name
    m.role = user.role
    m.password_hash = user.password_hash
    m.is_active = user.is_active
    m.created_at = user.created_at
    return m


def _orm_to_task(m: TaskModel) -> Task:
    """Convert TaskModel ORM instance to Task domain object."""
    return Task(
        id=m.id,
        title=m.title,
        description=m.description,
        status=m.status,
        priority=m.priority,
        project_id=m.project_id,
        creator_id=m.creator_id,
        assignee_id=m.assignee_id,
        due_date=m.due_date,
        tags=list(m.tags) if m.tags else [],
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


def _task_to_orm(task: Task, existing: TaskModel | None = None) -> TaskModel:
    """Map Task domain object to TaskModel."""
    m = existing or TaskModel()
    m.id = task.id
    m.title = task.title
    m.description = task.description
    m.status = task.status
    m.priority = task.priority
    m.project_id = task.project_id
    m.creator_id = task.creator_id
    m.assignee_id = task.assignee_id
    m.due_date = task.due_date
    m.tags = task.tags
    m.created_at = task.created_at
    m.updated_at = task.updated_at
    return m


def _orm_to_project(m: ProjectModel) -> Project:
    """Convert ProjectModel ORM instance to Project domain object."""
    return Project(
        id=m.id,
        name=m.name,
        description=m.description,
        owner_id=m.owner_id,
        created_at=m.created_at,
    )


def _project_to_orm(project: Project, existing: ProjectModel | None = None) -> ProjectModel:
    """Map Project domain object to ProjectModel."""
    m = existing or ProjectModel()
    m.id = project.id
    m.name = project.name
    m.description = project.description
    m.owner_id = project.owner_id
    m.created_at = project.created_at
    return m


# ── Repository Implementations ────────────────────────────────────────────────

class SQLAlchemyTaskRepository(TaskRepository):
    """PostgreSQL-backed Task repository using SQLAlchemy async sessions."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def save(self, task: Task) -> Task:
        """Upsert a task. Merges if exists, adds if new."""
        existing = await self._session.get(TaskModel, task.id)
        orm = _task_to_orm(task, existing)
        if existing is None:
            self._session.add(orm)
        await self._session.flush()
        await self._session.refresh(orm)
        return _orm_to_task(orm)

    async def get_by_id(self, task_id: UUID) -> Task | None:
        """Return task domain object or None."""
        orm = await self._session.get(TaskModel, task_id)
        return _orm_to_task(orm) if orm else None

    async def list_by_project(
        self,
        project_id: UUID,
        status: TaskStatus | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Task], int]:
        """Return paginated tasks for a project with optional status filter.

        Returns:
            Tuple of (task list, total matching count).
        """
        base_query = select(TaskModel).where(TaskModel.project_id == project_id)
        count_query = select(func.count()).select_from(TaskModel).where(
            TaskModel.project_id == project_id
        )

        if status is not None:
            base_query = base_query.where(TaskModel.status == status)
            count_query = count_query.where(TaskModel.status == status)

        total_result = await self._session.execute(count_query)
        total: int = total_result.scalar_one()

        offset = (page - 1) * page_size
        items_result = await self._session.execute(
            base_query.order_by(TaskModel.created_at.desc()).limit(page_size).offset(offset)
        )
        tasks = [_orm_to_task(row) for row in items_result.scalars().all()]
        return tasks, total

    async def delete(self, task_id: UUID) -> None:
        """Hard-delete a task."""
        orm = await self._session.get(TaskModel, task_id)
        if orm is not None:
            await self._session.delete(orm)
            await self._session.flush()


class SQLAlchemyUserRepository(UserRepository):
    """PostgreSQL-backed User repository."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def save(self, user: User) -> User:
        """Upsert a user."""
        existing = await self._session.get(UserModel, user.id)
        orm = _user_to_orm(user, existing)
        if existing is None:
            self._session.add(orm)
        await self._session.flush()
        await self._session.refresh(orm)
        return _orm_to_user(orm)

    async def get_by_id(self, user_id: UUID) -> User | None:
        """Return user by primary key or None."""
        orm = await self._session.get(UserModel, user_id)
        return _orm_to_user(orm) if orm else None

    async def get_by_email(self, email: str) -> User | None:
        """Return user by unique email or None."""
        result = await self._session.execute(
            select(UserModel).where(UserModel.email == email.lower())
        )
        orm = result.scalar_one_or_none()
        return _orm_to_user(orm) if orm else None


class SQLAlchemyProjectRepository(ProjectRepository):
    """PostgreSQL-backed Project repository."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def save(self, project: Project) -> Project:
        """Upsert a project."""
        existing = await self._session.get(ProjectModel, project.id)
        orm = _project_to_orm(project, existing)
        if existing is None:
            self._session.add(orm)
        await self._session.flush()
        await self._session.refresh(orm)
        return _orm_to_project(orm)

    async def get_by_id(self, project_id: UUID) -> Project | None:
        """Return project by primary key or None."""
        orm = await self._session.get(ProjectModel, project_id)
        return _orm_to_project(orm) if orm else None

    async def list_by_owner(self, owner_id: UUID) -> list[Project]:
        """Return all projects owned by a user, ordered by creation date."""
        result = await self._session.execute(
            select(ProjectModel)
            .where(ProjectModel.owner_id == owner_id)
            .order_by(ProjectModel.created_at.desc())
        )
        return [_orm_to_project(row) for row in result.scalars().all()]

    async def delete(self, project_id: UUID) -> None:
        """Hard-delete a project (cascades to tasks via FK constraint)."""
        orm = await self._session.get(ProjectModel, project_id)
        if orm is not None:
            await self._session.delete(orm)
            await self._session.flush()
