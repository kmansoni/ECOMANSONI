# syntax=docker/dockerfile:1
# calls-ws — Mansoni Calls WS Gateway
# Build context must be the project root:
#   docker build -t mansoni-calls-ws -f server/calls-ws/Dockerfile .

FROM node:20-alpine AS deps
WORKDIR /app

# Copy package manifests from project root (calls-ws shares root node_modules)
COPY package.json ./
COPY bun.lockb* package-lock.json* yarn.lock* ./

# Install production dependencies only
RUN npm ci --omit=dev --ignore-scripts || npm install --omit=dev --ignore-scripts

# ---- runtime image ----
FROM node:20-alpine AS runtime
WORKDIR /app

# Non-root user
RUN addgroup -S mansoni && adduser -S mansoni -G mansoni

# Copy installed modules
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json

# Copy the gateway source and its sibling modules
COPY server/calls-ws/ ./server/calls-ws/

# Ownership
RUN chown -R mansoni:mansoni /app

USER mansoni

ENV NODE_ENV=production
ENV ENV=production
ENV CALLS_WS_PORT=8787

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:8787/health 2>/dev/null | grep -q '"ok"' || \
      wget -qO- http://localhost:8787/ 2>/dev/null || exit 1

CMD ["node", "server/calls-ws/index.mjs"]
