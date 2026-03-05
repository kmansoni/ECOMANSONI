"""Application Services (Use Cases) — orchestrate domain logic and repositories.

Services are the entry point for all business operations. They:
- Accept DTOs from the presentation layer
- Validate business rules using domain models
- Coordinate repository calls within a single unit of work
- Emit domain events after successful persistence
- Return domain objects (mapped to DTOs by the presentation layer)

Services have NO knowledge of HTTP, SQL, or JWT.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from datetime import datetime
from uuid import UUID, uuid4

from app.application.dto import (
    AssignTaskRequest,
    CreateProjectRequest,
    CreateTaskRequest,
    CreateUserRequest,
    LoginRequest,
    UpdateTaskRequest,
)
from app.domain.events import (
    TaskAssigned,
    TaskCompleted,
    TaskCreated,
    TaskDeleted,
    TaskUpdated,
    UserRegistered,
)
from app.domain.exceptions import (
    AuthorizationError,
    DuplicateError,
    ProjectNotFoundError,
    TaskNotFoundError,
    UserNotFoundError,
    ValidationError,
)
from app.domain.models import Email, Project, Task, TaskPriority, TaskStatus, User, UserRole

logger = logging.getLogger(__name__)


# ── Abstract Repository Interfaces (Ports) ────────────────────────────────────

class TaskRepository(ABC):
    """Port — defines persistence contract for Tasks."""

    @abstractmethod
    async def save(self, task: Task) -> Task:
        """Persist a new or updated task. Returns the saved entity."""
        ...

    @abstractmethod
    async def get_by_id(self, task_id: UUID) -> Task | None:
        """Return task by ID or None if not found."""
        ...

    @abstractmethod
    async def list_by_project(
        self,
        project_id: UUID,
        status: TaskStatus | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Task], int]:
        """Return (tasks, total_count) for a project with optional status filter."""
        ...

    @abstractmethod
    async def delete(self, task_id: UUID) -> None:
        """Hard-delete a task by ID."""
        ...


class UserRepository(ABC):
    """Port — defines persistence contract for Users."""

    @abstractmethod
    async def save(self, user: User) -> User:
        ...

    @abstractmethod
    async def get_by_id(self, user_id: UUID) -> User | None:
        ...

    @abstractmethod
    async def get_by_email(self, email: str) -> User | None:
        ...


class ProjectRepository(ABC):
    """Port — defines persistence contract for Projects."""

    @abstractmethod
    async def save(self, project: Project) -> Project:
        ...

    @abstractmethod
    async def get_by_id(self, project_id: UUID) -> Project | None:
        ...

    @abstractmethod
    async def list_by_owner(self, owner_id: UUID) -> list[Project]:
        ...

    @abstractmethod
    async def delete(self, project_id: UUID) -> None:
        ...


class PasswordHasher(ABC):
    """Port — password hashing contract (decouples bcrypt from domain)."""

    @abstractmethod
    def hash(self, plain: str) -> str:
        ...

    @abstractmethod
    def verify(self, plain: str, hashed: str) -> bool:
        ...


# ── Task Service ──────────────────────────────────────────────────────────────

class TaskService:
    """Use cases for task lifecycle management.

    All mutating operations return the updated domain object. The caller
    (presentation layer) is responsible for collecting and dispatching events.
    """

    def __init__(
        self,
        task_repo: TaskRepository,
        project_repo: ProjectRepository,
        user_repo: UserRepository,
    ) -> None:
        self._tasks = task_repo
        self._projects = project_repo
        self._users = user_repo

    async def create(self, dto: CreateTaskRequest, creator_id: UUID) -> tuple[Task, TaskCreated]:
        """Create a new task in a project.

        Args:
            dto: Validated creation request.
            creator_id: ID of the authenticated user creating the task.

        Returns:
            Tuple of (saved Task, TaskCreated event).

        Raises:
            ProjectNotFoundError: If the project does not exist.
        """
        project = await self._projects.get_by_id(dto.project_id)
        if project is None:
            raise ProjectNotFoundError(dto.project_id)

        now = datetime.utcnow()
        task = Task(
            id=uuid4(),
            title=dto.title.strip(),
            description=dto.description,
            project_id=dto.project_id,
            creator_id=creator_id,
            status=TaskStatus.TODO,
            priority=dto.priority,
            due_date=dto.due_date,
            tags=dto.tags,
            created_at=now,
            updated_at=now,
        )
        saved = await self._tasks.save(task)
        event = TaskCreated(
            aggregate_id=saved.id,
            project_id=saved.project_id,
            creator_id=creator_id,
            title=saved.title,
        )
        logger.info("task.created id=%s project=%s", saved.id, saved.project_id)
        return saved, event

    async def get(self, task_id: UUID) -> Task:
        """Retrieve a task by ID.

        Raises:
            TaskNotFoundError: If task does not exist.
        """
        task = await self._tasks.get_by_id(task_id)
        if task is None:
            raise TaskNotFoundError(task_id)
        return task

    async def update(
        self, task_id: UUID, dto: UpdateTaskRequest, updated_by: UUID
    ) -> tuple[Task, TaskUpdated]:
        """Partially update task fields.

        Raises:
            TaskNotFoundError: Task not found.
            ValidationError: Business rule violated (e.g. invalid status transition).
        """
        task = await self.get(task_id)
        changed: set[str] = set()

        if dto.title is not None and dto.title != task.title:
            task.title = dto.title.strip()
            changed.add("title")
        if dto.description is not None and dto.description != task.description:
            task.description = dto.description
            changed.add("description")
        if dto.priority is not None and dto.priority != task.priority:
            task.priority = dto.priority
            changed.add("priority")
        if dto.status is not None and dto.status != task.status:
            task.transition_to(dto.status)
            changed.add("status")
        if dto.due_date is not None:
            task.due_date = dto.due_date
            changed.add("due_date")
        if dto.tags is not None:
            task.tags = dto.tags
            changed.add("tags")

        task.updated_at = datetime.utcnow()
        saved = await self._tasks.save(task)
        event = TaskUpdated(
            aggregate_id=task_id,
            changed_fields=frozenset(changed),
            updated_by=updated_by,
        )
        return saved, event

    async def assign(
        self, task_id: UUID, dto: AssignTaskRequest, assigned_by: UUID
    ) -> tuple[Task, TaskAssigned]:
        """Assign task to a user.

        Raises:
            TaskNotFoundError: Task not found.
            UserNotFoundError: Assignee not found.
            ValidationError: Task is in terminal state.
        """
        task = await self.get(task_id)
        assignee = await self._users.get_by_id(dto.assignee_id)
        if assignee is None:
            raise UserNotFoundError(dto.assignee_id)
        if not assignee.is_active:
            raise ValidationError("Cannot assign task to deactivated user")

        task.assign_to(dto.assignee_id)
        saved = await self._tasks.save(task)
        event = TaskAssigned(aggregate_id=task_id, assignee_id=dto.assignee_id, assigned_by=assigned_by)
        return saved, event

    async def complete(self, task_id: UUID, completed_by: UUID) -> tuple[Task, TaskCompleted]:
        """Mark task as DONE.

        Raises:
            TaskNotFoundError: Task not found.
            ValueError: Invalid status transition.
        """
        task = await self.get(task_id)
        task.complete()
        saved = await self._tasks.save(task)
        event = TaskCompleted(aggregate_id=task_id, completed_by=completed_by)
        return saved, event

    async def delete(self, task_id: UUID, deleted_by: UUID, actor_role: UserRole) -> TaskDeleted:
        """Permanently delete a task. Requires ADMIN role or task creator.

        Raises:
            TaskNotFoundError: Task not found.
            AuthorizationError: Actor lacks permission.
        """
        task = await self.get(task_id)
        if actor_role != UserRole.ADMIN and task.creator_id != deleted_by:
            raise AuthorizationError(action="delete", resource=f"Task({task_id})")
        await self._tasks.delete(task_id)
        return TaskDeleted(aggregate_id=task_id, deleted_by=deleted_by)

    async def list_project_tasks(
        self,
        project_id: UUID,
        status: TaskStatus | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Task], int]:
        """List tasks in a project with optional status filter and pagination."""
        return await self._tasks.list_by_project(project_id, status, page, page_size)


# ── User Service ──────────────────────────────────────────────────────────────

class UserService:
    """Use cases for user registration and authentication."""

    def __init__(self, user_repo: UserRepository, hasher: PasswordHasher) -> None:
        self._users = user_repo
        self._hasher = hasher

    async def register(self, dto: CreateUserRequest) -> tuple[User, UserRegistered]:
        """Register a new user.

        Args:
            dto: Validated registration request.

        Returns:
            Tuple of (created User, UserRegistered event).

        Raises:
            DuplicateError: Email already registered.
        """
        existing = await self._users.get_by_email(dto.email)
        if existing is not None:
            raise DuplicateError(entity="User", field="email", value=dto.email)

        email_vo = Email(value=dto.email)
        user = User(
            id=uuid4(),
            email=email_vo,
            name=dto.name.strip(),
            role=UserRole.MEMBER,
            password_hash=self._hasher.hash(dto.password),
            created_at=datetime.utcnow(),
        )
        saved = await self._users.save(user)
        event = UserRegistered(aggregate_id=saved.id, email=dto.email, role=UserRole.MEMBER.value)
        logger.info("user.registered id=%s email=%s", saved.id, dto.email)
        return saved, event

    async def authenticate(self, dto: LoginRequest) -> User:
        """Verify credentials and return the authenticated User.

        Args:
            dto: Login request with email and password.

        Returns:
            Authenticated User domain object.

        Raises:
            ValidationError: Credentials are invalid (intentionally vague message
                to prevent email enumeration attacks).
        """
        user = await self._users.get_by_email(dto.email)
        if user is None or not self._hasher.verify(dto.password, user.password_hash):
            raise ValidationError("Invalid email or password")
        if not user.is_active:
            raise ValidationError("Account is deactivated")
        return user

    async def get_profile(self, user_id: UUID) -> User:
        """Return user profile by ID.

        Raises:
            UserNotFoundError: User not found.
        """
        user = await self._users.get_by_id(user_id)
        if user is None:
            raise UserNotFoundError(user_id)
        return user


# ── Project Service ───────────────────────────────────────────────────────────

class ProjectService:
    """Use cases for project management."""

    def __init__(self, project_repo: ProjectRepository, user_repo: UserRepository) -> None:
        self._projects = project_repo
        self._users = user_repo

    async def create(self, dto: CreateProjectRequest, owner_id: UUID) -> Project:
        """Create a new project.

        Raises:
            UserNotFoundError: Owner not found.
        """
        owner = await self._users.get_by_id(owner_id)
        if owner is None:
            raise UserNotFoundError(owner_id)

        project = Project(
            id=uuid4(),
            name=dto.name.strip(),
            description=dto.description,
            owner_id=owner_id,
            created_at=datetime.utcnow(),
        )
        return await self._projects.save(project)

    async def get(self, project_id: UUID) -> Project:
        """Return project by ID.

        Raises:
            ProjectNotFoundError: Project not found.
        """
        project = await self._projects.get_by_id(project_id)
        if project is None:
            raise ProjectNotFoundError(project_id)
        return project

    async def list_owned(self, owner_id: UUID) -> list[Project]:
        """List all projects owned by a user."""
        return await self._projects.list_by_owner(owner_id)

    async def delete(self, project_id: UUID, actor_id: UUID, actor_role: UserRole) -> None:
        """Delete a project. Only owner or ADMIN can delete.

        Raises:
            ProjectNotFoundError: Project not found.
            AuthorizationError: Actor is not the owner or ADMIN.
        """
        project = await self.get(project_id)
        if actor_role != UserRole.ADMIN and project.owner_id != actor_id:
            raise AuthorizationError(action="delete", resource=f"Project({project_id})")
        await self._projects.delete(project_id)
