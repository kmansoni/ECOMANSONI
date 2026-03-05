# ── Builder stage ─────────────────────────────────────────────────────────────
# Install dependencies in an isolated layer so the runtime image stays small.
FROM python:3.12-slim AS builder

WORKDIR /build

# Install build tools needed for bcrypt/asyncpg native extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip \
    && pip install --no-cache-dir --prefix=/install -r requirements.txt


# ── Runtime stage ─────────────────────────────────────────────────────────────
# Lean image with only what's needed to run the application.
FROM python:3.12-slim AS runtime

WORKDIR /app

# Install runtime-only system deps (libpq for asyncpg)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Non-root user for least-privilege execution
RUN groupadd --gid 1001 appgroup \
    && useradd --uid 1001 --gid appgroup --no-create-home --shell /bin/false appuser

# Copy application source
COPY app/ ./app/

# Set ownership
RUN chown -R appuser:appgroup /app

USER appuser

# Expose port
EXPOSE 8000

# Health check (Docker/Kubernetes liveness probe)
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Uvicorn with production settings:
# - workers=1 for Kubernetes (horizontal scaling via pod replicas)
# - Access log disabled (structured logging in middleware)
# - Timeout for graceful shutdown
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "1", \
     "--no-access-log", \
     "--timeout-graceful-shutdown", "30"]
