# ── Build stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer caching)
COPY package*.json ./
RUN npm ci

# Copy source and compile TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# ── Production stage ───────────────────────────────────────────────────────
FROM node:20-alpine

# FFmpeg for render pipeline, curl for healthcheck
RUN apk add --no-cache ffmpeg curl

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy compiled JS from builder stage
COPY --from=builder /app/dist ./dist/

# Create render temp directory
RUN mkdir -p /tmp/editor-render

EXPOSE 3002

# Run as non-root for security
USER node

CMD ["node", "dist/index.js"]
