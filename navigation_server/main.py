"""
Navigation Server — FastAPI Application Entry Point

Lifespan:
  startup  → DB pool, Redis, Kafka producer, HTTP client, service instances
  shutdown → graceful close of all connections

Middleware stack (outer → inner):
  1. CORS
  2. Prometheus instrumentation (prometheus-fastapi-instrumentator)
  3. Structured request logging
  4. Exception → JSON response mapping

OpenAPI schema auto-generated at /docs (disabled in production via env).
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

import httpx
import orjson
import structlog
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from pydantic import ValidationError

from config import get_settings
from database import close_db, init_db, get_pool
from exceptions import NavigationBaseError
from kafka_client import close_kafka, init_kafka, get_kafka_producer
from redis_client import close_redis, init_redis, get_redis_client
from routers import crowdsource, dispatch, geocoding, health, location, poi, routing, search, trips
from routers import traffic, surge, risk
from services.geocoding_service import GeocodingService
from services.h3_service import H3Service
from services.poi_service import POIService
from services.routing_service import RoutingService
from services.traffic_service import TrafficService
from services.risk_service import RiskService
from services.surge_service import SurgeService
from services.presence_service import PresenceService

# ── Logging setup (structlog JSON renderer for production) ────────────────────

settings = get_settings()

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer(serializer=orjson.dumps),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(
        getattr(__import__("logging"), settings.LOG_LEVEL, 20)
    ),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger(__name__)


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Application lifespan handler.
    All startup failures are fatal — the container exits and Kubernetes restarts it.
    This ensures the pod never silently degrades.
    """
    s = get_settings()
    logger.info("navigation_server.starting", environment=s.ENVIRONMENT)

    # ── Startup ───────────────────────────────────────────────────────────────
    await init_db()
    await init_redis()
    await init_kafka()

    # Shared HTTP client (connection pooling across all services)
    http_client = httpx.AsyncClient(
        limits=httpx.Limits(
            max_connections=200,
            max_keepalive_connections=50,
            keepalive_expiry=30,
        ),
        timeout=httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0),
        follow_redirects=False,
    )

    # Service singletons (stateless except injected dependencies)
    pool = get_pool()
    redis = get_redis_client()

    app.state.http_client = http_client
    app.state.routing_service = RoutingService(
        valhalla_url=str(s.VALHALLA_URL),
        http_client=http_client,
    )
    app.state.geocoding_service = GeocodingService(
        photon_url=str(s.PHOTON_URL),
        http_client=http_client,
        redis=redis,
        db_pool=pool,
    )
    app.state.poi_service = POIService(
        db_pool=pool,
        redis=redis,
    )

    kafka = get_kafka_producer()
    h3 = H3Service()

    app.state.traffic_service = TrafficService(
        db_pool=pool,
        redis=redis,
        kafka=kafka,
        h3_service=h3,
    )
    app.state.risk_service = RiskService(
        db_pool=pool,
        redis=redis,
        kafka=kafka,
        h3_service=h3,
    )
    presence = PresenceService(redis=redis, kafka_producer=kafka, h3_service=h3)
    app.state.surge_service = SurgeService(
        db_pool=pool,
        redis=redis,
        kafka=kafka,
        h3_service=h3,
        presence_service=presence,
        risk_service=app.state.risk_service,
    )

    logger.info("navigation_server.ready")
    yield

    # ── Shutdown ──────────────────────────────────────────────────────────────
    logger.info("navigation_server.shutting_down")
    await http_client.aclose()
    await close_kafka()
    await close_redis()
    await close_db()
    logger.info("navigation_server.stopped")


# ── Application factory ───────────────────────────────────────────────────────

def create_app() -> FastAPI:
    s = get_settings()

    app = FastAPI(
        title="ECOMANSONI Navigation Server",
        version="1.0.0",
        description=(
            "Production navigation backend: routing (Valhalla), geocoding (Photon), "
            "POI (PostGIS), real-time location, dispatch, and crowdsourcing."
        ),
        docs_url="/docs" if s.ENVIRONMENT != "production" else None,
        redoc_url="/redoc" if s.ENVIRONMENT != "production" else None,
        openapi_url="/openapi.json" if s.ENVIRONMENT != "production" else None,
        lifespan=lifespan,
        # orjson for serialisation — faster than stdlib json, handles datetime/UUID
        default_response_class=_ORJSONResponse,
    )

    # ── CORS ──────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=s.cors_origins_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Api-Key", "X-Trace-Id"],
        expose_headers=["X-Trace-Id"],
        max_age=600,
    )

    # ── Prometheus ────────────────────────────────────────────────────────────
    Instrumentator(
        should_group_status_codes=True,
        should_ignore_untemplated=True,
        should_respect_env_var=False,
        should_instrument_requests_inprogress=True,
        excluded_handlers=["/health", "/metrics"],
        inprogress_name="nav_requests_inprogress",
        inprogress_labels=True,
    ).instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)

    # ── Exception handlers ────────────────────────────────────────────────────
    @app.exception_handler(NavigationBaseError)
    async def navigation_error_handler(
        request: Request, exc: NavigationBaseError
    ) -> JSONResponse:
        trace_id = _get_trace_id(request)
        logger.warning(
            "exception.navigation",
            trace_id=trace_id,
            error_code=exc.error_code,
            message=exc.message,
            path=str(request.url),
        )
        return _ORJSONResponse(
            content={
                "success": False,
                "error": exc.message,
                "error_code": exc.error_code,
                "trace_id": trace_id,
            },
            status_code=exc.status_code,
        )

    @app.exception_handler(ValidationError)
    async def pydantic_validation_handler(
        request: Request, exc: ValidationError
    ) -> JSONResponse:
        trace_id = _get_trace_id(request)
        return _ORJSONResponse(
            content={
                "success": False,
                "error": "Request validation failed",
                "error_code": "VALIDATION_ERROR",
                "detail": exc.errors(),
                "trace_id": trace_id,
            },
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        trace_id = _get_trace_id(request)
        logger.error(
            "exception.unhandled",
            trace_id=trace_id,
            path=str(request.url),
            exc_info=exc,
        )
        return _ORJSONResponse(
            content={
                "success": False,
                "error": "Internal server error",
                "error_code": "INTERNAL_ERROR",
                "trace_id": trace_id,
            },
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # ── Request logging middleware ────────────────────────────────────────────
    @app.middleware("http")
    async def request_logging_middleware(request: Request, call_next):
        import time
        trace_id = request.headers.get("X-Trace-Id") or str(uuid.uuid4())
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(trace_id=trace_id)

        t0 = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = round((time.perf_counter() - t0) * 1000, 1)

        logger.info(
            "http.request",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            elapsed_ms=elapsed_ms,
        )
        response.headers["X-Trace-Id"] = trace_id
        return response

    # ── Routers ───────────────────────────────────────────────────────────────
    app.include_router(health.router)
    app.include_router(routing.router)
    app.include_router(geocoding.router)
    app.include_router(poi.router)
    app.include_router(search.router)
    app.include_router(location.router)
    app.include_router(crowdsource.router)
    app.include_router(trips.router)
    app.include_router(dispatch.router)
    app.include_router(traffic.router)
    app.include_router(surge.router)
    app.include_router(risk.router)

    return app


# ── Helpers ───────────────────────────────────────────────────────────────────

class _ORJSONResponse(JSONResponse):
    """JSONResponse that uses orjson for serialisation (datetime, UUID support)."""

    media_type = "application/json"

    def render(self, content: Any) -> bytes:
        return orjson.dumps(
            content,
            option=orjson.OPT_NON_STR_KEYS | orjson.OPT_SERIALIZE_UUID,
        )


def _get_trace_id(request: Request) -> str:
    return request.headers.get("X-Trace-Id") or str(uuid.uuid4())


# ── Entry point ───────────────────────────────────────────────────────────────

app = create_app()
