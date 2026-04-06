# syntax=docker/dockerfile:1
# mediasoup SFU — Mansoni Calls SFU (production)
# Requires glibc (Debian/Ubuntu) — mediasoup native bindings won't build on Alpine.
#
# Build from project root:
#   docker build -t mansoni-sfu -f server/sfu/Dockerfile .
#
# Run:
#   docker run -e SFU_ANNOUNCED_IP=<vps-public-ip> -p 4443:4443 -p 40000-49999:40000-49999/udp mansoni-sfu

FROM node:20-bookworm AS deps
WORKDIR /app

# mediasoup native binaries need python3 + make + g++
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* bun.lockb* ./
# Install all dependencies including optional (mediasoup)
RUN npm ci --ignore-scripts || npm install --ignore-scripts
# Rebuild mediasoup native binaries explicitly after install
RUN node -e "require('mediasoup')" 2>/dev/null || npm rebuild mediasoup || true

# ---- runtime image ----
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

# Runtime deps for mediasoup workers (libssl, libstdc++)
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends libstdc++6 && \
    rm -rf /var/lib/apt/lists/*

RUN groupadd -r mansoni && useradd -r -g mansoni mansoni

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY server/sfu/ ./server/sfu/

RUN chown -R mansoni:mansoni /app
USER mansoni

ENV NODE_ENV=production
ENV SFU_PORT=4443
ENV SFU_ENABLE_MEDIASOUP=1
ENV SFU_REQUIRE_MEDIASOUP=1
ENV SFU_REQUIRE_SFRAME=1
ENV SFU_INSECURE_DEV_MODE=0

EXPOSE 4443

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4443/health', r => r.statusCode === 200 ? process.exit(0) : process.exit(1)).on('error', () => process.exit(1))"

CMD ["node", "server/sfu/index.mjs"]
