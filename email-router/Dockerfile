# ─── Stage 1: deps (no-op — zero external deps) ──────────────────────────────
# We have no node_modules to install, so this image is used directly.

FROM node:20-alpine AS base

LABEL maintainer="platform@mansoni.ru"
LABEL org.opencontainers.image.title="email-router"
LABEL org.opencontainers.image.version="1.0.0"

# ─── Stage 2: production image ────────────────────────────────────────────────
FROM base AS production

# Non-root user for principle of least privilege
RUN addgroup -S emailrouter && adduser -S emailrouter -G emailrouter

WORKDIR /app

# Copy source (no node_modules — zero deps)
COPY --chown=emailrouter:emailrouter package.json ./
COPY --chown=emailrouter:emailrouter src/ ./src/

# Runtime directories (queue, logs) — created at container start
RUN mkdir -p /app/data/queue/pending \
             /app/data/queue/processing \
             /app/data/queue/failed \
             /app/data/queue/delivered \
             /app/logs \
    && chown -R emailrouter:emailrouter /app/data /app/logs

USER emailrouter

EXPOSE 8090

# Healthcheck — polls /health every 30s, fails after 3 consecutive failures
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "\
    const http = require('http'); \
    const req = http.get('http://localhost:8090/health', (res) => { \
      process.exit(res.statusCode === 200 ? 0 : 1); \
    }); \
    req.on('error', () => process.exit(1)); \
    req.setTimeout(4000, () => { req.destroy(); process.exit(1); });"

CMD ["node", "src/index.js"]
