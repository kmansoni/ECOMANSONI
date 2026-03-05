"""FastAPI routers — HTTP presentation layer.

Responsibilities of this layer:
- Parse and validate HTTP requests (via Pydantic DTOs)
- Authenticate and authorize via dependency injection
- Delegate to application services
- Map domain objects to response DTOs
- Return appropriate HTTP status codes

This layer has ZERO business logic — it is pure translation.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.application.dto import (
    AssignTaskRequest,
    CreateProjectRequest,
    CreateTaskRequest,
    CreateUserRequest,
    LoginRequest,
    PaginatedResponse,
    ProjectResponse,
    TaskResponse,
    TokenResponse,
    UpdateTaskRequest,
    UserResponse,
)
from app.application.services import ProjectService, TaskService, UserService
from app.domain.exceptions import ValidationError as DomainValidationError
from app.domain.models import Task, TaskStatus, User, UserRole
from app.infrastructure.security import JWTService, TokenPayload, require_role

# ── Security scheme ───────────────────────────────────────────────────────────
bearer_scheme = HTTPBearer(auto_error=False)


# ── Dependency factories ──────────────────────────────────────────────────────
# These are injected at the app factory level in main.py.
# Declared here as module-level singletons that main.py overrides.
_jwt_service: JWTService | None = None
_task_service: TaskService | None = None
_user_service: UserService | None = None
_project_service: ProjectService | None = None


def set_services(
    jwt: JWTService,
    tasks: TaskService,
    users: UserService,
    projects: ProjectService,
) -> None:
    """Wire service instances at application startup."""
    global _jwt_service, _task_service, _user_service, _project_service
    _jwt_service = jwt
    _task_service = tasks
    _user_service = users
    _project_service = projects


def get_jwt_service() -> JWTService:
    assert _jwt_service is not None, "JWT service not initialized"
    return _jwt_service


def get_task_service() -> TaskService:
    assert _task_service is not None, "Task service not initialized"
    return _task_service


def get_user_service() -> UserService:
    assert _user_service is not None, "User service not initialized"
    return _user_service


def get_project_service() -> ProjectService:
    assert _project_service is not None, "Project service not initialized"
    return _project_service


# ── Auth dependency ───────────────────────────────────────────────────────────

async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    jwt_svc: Annotated[JWTService, Depends(get_jwt_service)],
    user_svc: Annotated[UserService, Depends(get_user_service)],
) -> User:
    """Validate Bearer token and return the authenticated User.

    Raises:
        HTTPException 401: Token missing, invalid, or expired.
        HTTPException 403: User is deactivated.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload: TokenPayload = jwt_svc.verify_access_token(credentials.credentials)
    except DomainValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=exc.message,
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = await user_svc.get_profile(payload.user_id)
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")
    return user


# ── Mapper helpers ────────────────────────────────────────────────────────────

def _task_to_response(task: Task) -> TaskResponse:
    return TaskResponse(
        id=task.id,
        title=task.title,
        description=task.description,
        status=task.status,
        priority=task.priority,
        project_id=task.project_id,
        creator_id=task.creator_id,
        assignee_id=task.assignee_id,
        due_date=task.due_date,
        tags=task.tags,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


# ── Task Router ───────────────────────────────────────────────────────────────
task_router = APIRouter(prefix="/tasks", tags=["Tasks"])


@task_router.post(
    "",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new task",
)
async def create_task(
    body: CreateTaskRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    svc: Annotated[TaskService, Depends(get_task_service)],
) -> TaskResponse:
    """Create a task in the specified project. Requires MEMBER or ADMIN role."""
    require_role(current_user.role, UserRole.MEMBER, resource="tasks")
    task, _ = await svc.create(body, creator_id=current_user.id)
    return _task_to_response(task)


@task_router.get(
    "",
    response_model=PaginatedResponse[TaskResponse],
    summary="List tasks in a project",
)
async def list_tasks(
    project_id: UUID,
    status_filter: TaskStatus | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    svc: TaskService = Depends(get_task_service),
) -> PaginatedResponse[TaskResponse]:
    """List tasks in a project with optional status filter and pagination."""
    tasks, total = await svc.list_project_tasks(project_id, status_filter, page, page_size)
    return PaginatedResponse(
        items=[_task_to_response(t) for t in tasks],
        total=total,
        page=page,
        page_size=page_size,
        has_next=(page * page_size) < total,
        has_prev=page > 1,
    )


@task_router.get("/{task_id}", response_model=TaskResponse, summary="Get task by ID")
async def get_task(
    task_id: UUID,
    current_user: User = Depends(get_current_user),
    svc: TaskService = Depends(get_task_service),
) -> TaskResponse:
    """Retrieve a single task by ID."""
    task = await svc.get(task_id)
    return _task_to_response(task)


@task_router.patch("/{task_id}", response_model=TaskResponse, summary="Update task fields")
async def update_task(
    task_id: UUID,
    body: UpdateTaskRequest,
    current_user: User = Depends(get_current_user),
    svc: TaskService = Depends(get_task_service),
) -> TaskResponse:
    """Partially update a task. Validates status transition rules."""
    require_role(current_user.role, UserRole.MEMBER, resource=f"task:{task_id}")
    task, _ = await svc.update(task_id, body, updated_by=current_user.id)
    return _task_to_response(task)


@task_router.delete(
    "/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a task",
)
async def delete_task(
    task_id: UUID,
    current_user: User = Depends(get_current_user),
    svc: TaskService = Depends(get_task_service),
) -> None:
    """Delete a task. Requires ADMIN role or task creator."""
    await svc.delete(task_id, deleted_by=current_user.id, actor_role=current_user.role)


@task_router.post("/{task_id}/assign", response_model=TaskResponse, summary="Assign task to user")
async def assign_task(
    task_id: UUID,
    body: AssignTaskRequest,
    current_user: User = Depends(get_current_user),
    svc: TaskService = Depends(get_task_service),
) -> TaskResponse:
    """Assign a task to a user. Task must not be in a terminal state."""
    require_role(current_user.role, UserRole.MEMBER, resource=f"task:{task_id}")
    task, _ = await svc.assign(task_id, body, assigned_by=current_user.id)
    return _task_to_response(task)


@task_router.post("/{task_id}/complete", response_model=TaskResponse, summary="Mark task as done")
async def complete_task(
    task_id: UUID,
    current_user: User = Depends(get_current_user),
    svc: TaskService = Depends(get_task_service),
) -> TaskResponse:
    """Transition task to DONE status."""
    require_role(current_user.role, UserRole.MEMBER, resource=f"task:{task_id}")
    task, _ = await svc.complete(task_id, completed_by=current_user.id)
    return _task_to_response(task)


# ── User Router ───────────────────────────────────────────────────────────────
user_router = APIRouter(prefix="/users", tags=["Users"])


@user_router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
)
async def register_user(
    body: CreateUserRequest,
    svc: UserService = Depends(get_user_service),
) -> UserResponse:
    """Register a new user account. Email must be unique."""
    user, _ = await svc.register(body)
    return UserResponse(
        id=user.id,
        email=str(user.email),
        name=user.name,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
    )


@user_router.post("/login", response_model=TokenResponse, summary="Authenticate and get tokens")
async def login(
    body: LoginRequest,
    svc: UserService = Depends(get_user_service),
    jwt_svc: JWTService = Depends(get_jwt_service),
) -> TokenResponse:
    """Authenticate with email/password. Returns JWT access token."""
    user = await svc.authenticate(body)
    access_token, _ = jwt_svc.create_access_token(user.id, user.role)
    # Refresh token omitted for brevity; production should use a separate signed refresh token
    return TokenResponse(
        access_token=access_token,
        refresh_token=access_token,  # placeholder — implement refresh flow separately
        expires_in=3600,
    )


@user_router.get("/me", response_model=UserResponse, summary="Get current user profile")
async def get_my_profile(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    """Return the authenticated user's profile."""
    return UserResponse(
        id=current_user.id,
        email=str(current_user.email),
        name=current_user.name,
        role=current_user.role,
        is_active=current_user.is_active,
        created_at=current_user.created_at,
    )


# ── Project Router ────────────────────────────────────────────────────────────
project_router = APIRouter(prefix="/projects", tags=["Projects"])


@project_router.post(
    "",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new project",
)
async def create_project(
    body: CreateProjectRequest,
    current_user: User = Depends(get_current_user),
    svc: ProjectService = Depends(get_project_service),
) -> ProjectResponse:
    """Create a project owned by the current user."""
    require_role(current_user.role, UserRole.MEMBER, resource="projects")
    project = await svc.create(body, owner_id=current_user.id)
    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        owner_id=project.owner_id,
        created_at=project.created_at,
    )


@project_router.get("", response_model=list[ProjectResponse], summary="List my projects")
async def list_projects(
    current_user: User = Depends(get_current_user),
    svc: ProjectService = Depends(get_project_service),
) -> list[ProjectResponse]:
    """List all projects owned by the current user."""
    projects = await svc.list_owned(owner_id=current_user.id)
    return [
        ProjectResponse(
            id=p.id, name=p.name, description=p.description,
            owner_id=p.owner_id, created_at=p.created_at,
        )
        for p in projects
    ]


@project_router.get("/{project_id}", response_model=ProjectResponse, summary="Get project by ID")
async def get_project(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    svc: ProjectService = Depends(get_project_service),
) -> ProjectResponse:
    """Retrieve a project by ID."""
    project = await svc.get(project_id)
    return ProjectResponse(
        id=project.id, name=project.name, description=project.description,
        owner_id=project.owner_id, created_at=project.created_at,
    )


@project_router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a project",
)
async def delete_project(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    svc: ProjectService = Depends(get_project_service),
) -> None:
    """Delete a project. Only the owner or ADMIN can delete."""
    await svc.delete(project_id, actor_id=current_user.id, actor_role=current_user.role)
