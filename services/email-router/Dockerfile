# =============================================================================
# Stage 1: Builder
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (pg, etc.)
RUN apk add --no-cache python3 make g++

# Copy package files first for layer caching
COPY package.json package-lock.json* ./

# Install all dependencies (including devDependencies for build)
RUN npm ci --ignore-scripts=false

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Prune devDependencies after build
RUN npm prune --production

# =============================================================================
# Stage 2: Runner (production)
# =============================================================================
FROM node:20-alpine AS runner

# Security: install curl for healthcheck, then lock down
RUN apk add --no-cache curl dumb-init \
    && addgroup -g 1001 -S emailrouter \
    && adduser -S emailrouter -u 1001 -G emailrouter

WORKDIR /app

# Copy production node_modules from builder
COPY --from=builder --chown=emailrouter:emailrouter /app/node_modules ./node_modules

# Copy compiled output
COPY --from=builder --chown=emailrouter:emailrouter /app/dist ./dist

# Copy package.json for runtime metadata
COPY --from=builder --chown=emailrouter:emailrouter /app/package.json ./package.json

# Copy migrations for runtime access
COPY --chown=emailrouter:emailrouter migrations/ ./migrations/

# Environment defaults
ENV NODE_ENV=production \
    PORT=3100

# Expose service port
EXPOSE 3100

# Switch to non-root user
USER emailrouter

# Health check: fail if /health does not return 200 within 3s
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3100/health || exit 1

# Use dumb-init to handle PID 1 and signal forwarding
ENTRYPOINT ["dumb-init", "--"]

# Start the service
CMD ["node", "dist/index.js"]
