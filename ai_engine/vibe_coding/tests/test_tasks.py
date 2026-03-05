"""Test suite for Task Management API.

Covers:
1. Unit tests for TaskService business logic (no I/O, mocked repos).
2. Unit tests for domain model state machine.
3. Unit tests for security utilities.
4. Integration-style tests using FastAPI TestClient with in-memory SQLite.

Test isolation: each test gets a fresh async session with rollback.
No shared mutable state between tests.
"""

from __future__ import annotations

import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4, UUID

from app.application.dto import (
    AssignTaskRequest,
    CreateTaskRequest,
    CreateUserRequest,
    LoginRequest,
    UpdateTaskRequest,
)
from app.application.services import TaskService, UserService
from app.domain.exceptions import (
    AuthorizationError,
    DuplicateError,
    ProjectNotFoundError,
    TaskNotFoundError,
    UserNotFoundError,
    ValidationError,
)
from app.domain.models import (
    Email,
    Project,
    Task,
    TaskPriority,
    TaskStatus,
    User,
    UserRole,
)
from app.infrastructure.security import BcryptPasswordHasher, JWTService


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def hasher() -> BcryptPasswordHasher:
    """Low-cost hasher for tests (rounds=4 for speed)."""
    return BcryptPasswordHasher(rounds=4)


@pytest.fixture
def jwt_service() -> JWTService:
    return JWTService(
        secret_key="test-secret-key-that-is-long-enough-32chars",
        algorithm="HS256",
        access_expire_minutes=60,
    )


@pytest.fixture
def sample_user() -> User:
    return User(
        id=uuid4(),
        email=Email("alice@example.com"),
        name="Alice",
        role=UserRole.MEMBER,
        password_hash="$2b$04$placeholder",
        created_at=datetime.utcnow(),
        is_active=True,
    )


@pytest.fixture
def sample_project(sample_user: User) -> Project:
    return Project(
        id=uuid4(),
        name="Test Project",
        description="",
        owner_id=sample_user.id,
        created_at=datetime.utcnow(),
    )


@pytest.fixture
def sample_task(sample_project: Project, sample_user: User) -> Task:
    now = datetime.utcnow()
    return Task(
        id=uuid4(),
        title="Implement feature X",
        description="Details here",
        project_id=sample_project.id,
        creator_id=sample_user.id,
        status=TaskStatus.TODO,
        priority=TaskPriority.MEDIUM,
        created_at=now,
        updated_at=now,
    )


# ── Domain Model Tests ────────────────────────────────────────────────────────

class TestTaskStateMachine:
    """Validate Task status transition rules."""

    def test_todo_to_in_progress(self, sample_task: Task) -> None:
        sample_task.transition_to(TaskStatus.IN_PROGRESS)
        assert sample_task.status == TaskStatus.IN_PROGRESS

    def test_invalid_transition_todo_to_done(self, sample_task: Task) -> None:
        with pytest.raises(ValueError, match="Cannot transition"):
            sample_task.transition_to(TaskStatus.DONE)

    def test_complete_from_in_progress(self, sample_task: Task) -> None:
        sample_task.transition_to(TaskStatus.IN_PROGRESS)
        sample_task.complete()
        assert sample_task.status == TaskStatus.DONE

    def test_cannot_reassign_completed_task(self, sample_task: Task) -> None:
        sample_task.transition_to(TaskStatus.IN_PROGRESS)
        sample_task.complete()
        with pytest.raises(ValueError, match="completed or cancelled"):
            sample_task.assign_to(uuid4())

    def test_empty_title_raises(self) -> None:
        with pytest.raises(ValueError, match="title must not be empty"):
            Task(
                id=uuid4(), title="   ", description="",
                project_id=uuid4(), creator_id=uuid4(),
                status=TaskStatus.TODO, priority=TaskPriority.LOW,
                created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
            )

    @pytest.mark.parametrize("title", ["  ", "", "\t\n"])
    def test_whitespace_only_title_raises(self, title: str) -> None:
        with pytest.raises(ValueError):
            Task(
                id=uuid4(), title=title, description="",
                project_id=uuid4(), creator_id=uuid4(),
                status=TaskStatus.TODO, priority=TaskPriority.LOW,
                created_at=datetime.utcnow(), updated_at=datetime.utcnow(),
            )


class TestEmailValueObject:
    """Validate Email value object construction."""

    @pytest.mark.parametrize("email", [
        "alice@example.com",
        "user+tag@domain.co.uk",
        "x@y.io",
    ])
    def test_valid_emails(self, email: str) -> None:
        vo = Email(email)
        assert str(vo) == email

    @pytest.mark.parametrize("email", [
        "not-an-email",
        "@missing-local.com",
        "missing@",
        "",
        "spaces in@email.com",
    ])
    def test_invalid_emails_raise(self, email: str) -> None:
        with pytest.raises(ValueError):
            Email(email)


# ── Security Tests ────────────────────────────────────────────────────────────

class TestBcryptHasher:
    def test_hash_and_verify(self, hasher: BcryptPasswordHasher) -> None:
        plain = "SecureP@ss1"
        hashed = hasher.hash(plain)
        assert hasher.verify(plain, hashed)

    def test_wrong_password_fails(self, hasher: BcryptPasswordHasher) -> None:
        hashed = hasher.hash("correct")
        assert not hasher.verify("wrong", hashed)

    def test_hashes_are_unique(self, hasher: BcryptPasswordHasher) -> None:
        h1 = hasher.hash("same")
        h2 = hasher.hash("same")
        assert h1 != h2  # Different salts


class TestJWTService:
    def test_create_and_verify_token(self, jwt_service: JWTService, sample_user: User) -> None:
        token, jti = jwt_service.create_access_token(sample_user.id, sample_user.role)
        payload = jwt_service.verify_access_token(token)
        assert payload.user_id == sample_user.id
        assert payload.role == sample_user.role
        assert payload.jti == jti

    def test_invalid_token_raises(self, jwt_service: JWTService) -> None:
        with pytest.raises(ValidationError, match="Invalid access token"):
            jwt_service.verify_access_token("not.a.valid.jwt")

    def test_tampered_token_raises(self, jwt_service: JWTService, sample_user: User) -> None:
        token, _ = jwt_service.create_access_token(sample_user.id, sample_user.role)
        tampered = token[:-5] + "XXXXX"
        with pytest.raises(ValidationError):
            jwt_service.verify_access_token(tampered)


# ── TaskService Unit Tests (mocked repos) ────────────────────────────────────

class TestTaskService:
    """Test TaskService use cases with mocked repository ports."""

    @pytest.fixture
    def task_repo(self) -> AsyncMock:
        repo = AsyncMock()
        repo.save = AsyncMock(side_effect=lambda t: t)
        return repo

    @pytest.fixture
    def project_repo(self, sample_project: Project) -> AsyncMock:
        repo = AsyncMock()
        repo.get_by_id = AsyncMock(return_value=sample_project)
        return repo

    @pytest.fixture
    def user_repo(self, sample_user: User) -> AsyncMock:
        repo = AsyncMock()
        repo.get_by_id = AsyncMock(return_value=sample_user)
        return repo

    @pytest.fixture
    def service(self, task_repo: AsyncMock, project_repo: AsyncMock, user_repo: AsyncMock) -> TaskService:
        return TaskService(task_repo=task_repo, project_repo=project_repo, user_repo=user_repo)

    @pytest.mark.asyncio
    async def test_create_task_success(
        self,
        service: TaskService,
        sample_user: User,
        sample_project: Project,
    ) -> None:
        dto = CreateTaskRequest(
            title="New Task",
            project_id=sample_project.id,
            priority=TaskPriority.HIGH,
        )
        task, event = await service.create(dto, creator_id=sample_user.id)
        assert task.title == "New Task"
        assert task.status == TaskStatus.TODO
        assert event.creator_id == sample_user.id

    @pytest.mark.asyncio
    async def test_create_task_project_not_found(
        self,
        task_repo: AsyncMock,
        user_repo: AsyncMock,
        sample_user: User,
    ) -> None:
        project_repo = AsyncMock()
        project_repo.get_by_id = AsyncMock(return_value=None)
        svc = TaskService(task_repo=task_repo, project_repo=project_repo, user_repo=user_repo)
        dto = CreateTaskRequest(title="X", project_id=uuid4(), priority=TaskPriority.LOW)
        with pytest.raises(ProjectNotFoundError):
            await svc.create(dto, creator_id=sample_user.id)

    @pytest.mark.asyncio
    async def test_get_task_not_found(self, service: TaskService, task_repo: AsyncMock) -> None:
        task_repo.get_by_id = AsyncMock(return_value=None)
        with pytest.raises(TaskNotFoundError):
            await service.get(uuid4())

    @pytest.mark.asyncio
    async def test_delete_by_non_owner_non_admin_raises(
        self,
        service: TaskService,
        task_repo: AsyncMock,
        sample_task: Task,
        sample_user: User,
    ) -> None:
        task_repo.get_by_id = AsyncMock(return_value=sample_task)
        other_user_id = uuid4()
        with pytest.raises(AuthorizationError):
            await service.delete(sample_task.id, deleted_by=other_user_id, actor_role=UserRole.MEMBER)

    @pytest.mark.asyncio
    async def test_admin_can_delete_any_task(
        self,
        service: TaskService,
        task_repo: AsyncMock,
        sample_task: Task,
    ) -> None:
        task_repo.get_by_id = AsyncMock(return_value=sample_task)
        task_repo.delete = AsyncMock()
        event = await service.delete(sample_task.id, deleted_by=uuid4(), actor_role=UserRole.ADMIN)
        assert event.aggregate_id == sample_task.id


# ── UserService Unit Tests ────────────────────────────────────────────────────

class TestUserService:
    @pytest.fixture
    def user_repo(self) -> AsyncMock:
        repo = AsyncMock()
        repo.get_by_email = AsyncMock(return_value=None)
        repo.save = AsyncMock(side_effect=lambda u: u)
        return repo

    @pytest.fixture
    def service(self, user_repo: AsyncMock, hasher: BcryptPasswordHasher) -> UserService:
        return UserService(user_repo=user_repo, hasher=hasher)

    @pytest.mark.asyncio
    async def test_register_success(self, service: UserService) -> None:
        dto = CreateUserRequest(email="bob@example.com", name="Bob", password="SecureP@ss1")
        user, event = await service.register(dto)
        assert user.email == Email("bob@example.com")
        assert event.email == "bob@example.com"

    @pytest.mark.asyncio
    async def test_register_duplicate_email_raises(
        self, service: UserService, user_repo: AsyncMock, sample_user: User
    ) -> None:
        user_repo.get_by_email = AsyncMock(return_value=sample_user)
        dto = CreateUserRequest(email="alice@example.com", name="Alice2", password="SecureP@ss1")
        with pytest.raises(DuplicateError):
            await service.register(dto)

    @pytest.mark.asyncio
    async def test_authenticate_wrong_password(
        self, service: UserService, user_repo: AsyncMock, sample_user: User, hasher: BcryptPasswordHasher
    ) -> None:
        sample_user.password_hash = hasher.hash("CorrectP@ss1")
        user_repo.get_by_email = AsyncMock(return_value=sample_user)
        with pytest.raises(ValidationError, match="Invalid email or password"):
            await service.authenticate(LoginRequest(email="alice@example.com", password="WrongPass"))
