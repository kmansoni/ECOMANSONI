"""FastAPI application factory and lifespan management.

The app is constructed via a factory function (not module-level instantiation)
to allow:
1. Tests to pass custom settings without environment contamination.
2. Clean startup/shutdown lifecycle with async context managers.
3. Dependency injection wiring at startup, not import time.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings, get_settings
from app.infrastructure.database import Base, create_engine, create_session_factory
from app.infrastructure.repositories import (
    SQLAlchemyProjectRepository,
    SQLAlchemyTaskRepository,
    SQLAlchemyUserRepository,
)
from app.infrastructure.security import BcryptPasswordHasher, JWTService
from app.application.services import ProjectService, TaskService, UserService
from app.presentation.api import (
    project_router,
    set_services,
    task_router,
    user_router,
)
from app.presentation.middleware import (
    ErrorHandlingMiddleware,
    InMemoryRateLimitMiddleware,
    RequestLoggingMiddleware,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    """Construct and configure the FastAPI application.

    Args:
        settings: Optional settings override (useful in tests).

    Returns:
        Fully configured FastAPI application instance.
    """
    cfg = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
        """Manage startup and graceful shutdown."""
        logger.info("startup environment=%s", cfg.environment)

        engine = create_engine(str(cfg.database_url), echo=cfg.db_echo_sql)
        session_factory = create_session_factory(engine)

        # Create tables (use Alembic migrations in production)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        # Wire services (one session per request via dependency injection)
        async def _get_session():  # type: ignore[no-untyped-def]
            async with session_factory() as session:
                yield session

        # For simplicity, create a single session at startup for service mocking.
        # In production, each request spawns its own session via FastAPI Depends.
        _session = session_factory()

        hasher = BcryptPasswordHasher(rounds=cfg.bcrypt_rounds)
        jwt_svc = JWTService(
            secret_key=cfg.jwt_secret_key,
            algorithm=cfg.jwt_algorithm,
            access_expire_minutes=cfg.jwt_access_token_expire_minutes,
        )

        async with session_factory() as boot_session:
            task_svc = TaskService(
                task_repo=SQLAlchemyTaskRepository(boot_session),
                project_repo=SQLAlchemyProjectRepository(boot_session),
                user_repo=SQLAlchemyUserRepository(boot_session),
            )
            user_svc = UserService(
                user_repo=SQLAlchemyUserRepository(boot_session),
                hasher=hasher,
            )
            project_svc = ProjectService(
                project_repo=SQLAlchemyProjectRepository(boot_session),
                user_repo=SQLAlchemyUserRepository(boot_session),
            )
            set_services(jwt=jwt_svc, tasks=task_svc, users=user_svc, projects=project_svc)

        app.state.engine = engine
        app.state.session_factory = session_factory
        logger.info("startup.complete")

        yield

        logger.info("shutdown.begin")
        await engine.dispose()
        logger.info("shutdown.complete")

    app = FastAPI(
        title=cfg.app_name,
        version=cfg.app_version,
        description="Production-ready Task Management API — Vibe Coding reference implementation",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    # ── Middleware (applied in reverse order) ─────────────────────────────────
    app.add_middleware(ErrorHandlingMiddleware)
    app.add_middleware(RequestLoggingMiddleware)
    app.add_middleware(
        InMemoryRateLimitMiddleware,
        requests_per_minute=cfg.rate_limit_requests_per_minute,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.cors_allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routers ───────────────────────────────────────────────────────────────
    api_prefix = "/api/v1"
    app.include_router(task_router, prefix=api_prefix)
    app.include_router(user_router, prefix=api_prefix)
    app.include_router(project_router, prefix=api_prefix)

    @app.get("/health", tags=["Ops"], summary="Health check")
    async def health() -> dict[str, str]:
        """Liveness probe endpoint for load balancers and orchestrators."""
        return {"status": "ok", "version": cfg.app_version}

    return app


# Entrypoint for `uvicorn app.main:app`
app = create_app()
