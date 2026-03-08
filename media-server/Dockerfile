# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install build deps for native modules (sharp, canvas)
RUN apk add --no-cache python3 make g++ vips-dev

COPY package*.json ./
RUN npm ci --ignore-scripts

# Rebuild sharp for the alpine target AFTER installing vips-dev
RUN npm rebuild sharp

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# ── Stage 2: runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# ffmpeg for video thumbnail generation
RUN apk add --no-cache ffmpeg vips wget

# Non-root user
RUN addgroup -S media && adduser -S media -G media

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm rebuild sharp

COPY --from=builder /app/dist ./dist

# Temp directories for video processing and HLS transcoding
RUN mkdir -p /tmp/media-uploads /tmp/media-transcode \
    && chown media:media /tmp/media-uploads /tmp/media-transcode

USER media

ENV NODE_ENV=production

EXPOSE 3100

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --spider -q http://localhost:3100/health || exit 1

CMD ["node", "dist/index.js"]
