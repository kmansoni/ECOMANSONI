/**
 * config.ts — Environment variables validation via envalid.
 *
 * All env vars are validated at startup. Missing/malformed variables cause
 * immediate process exit with a clear error message (fail-fast strategy).
 * No secrets are logged — only variable names are reported on error.
 */

import { cleanEnv, str, num, bool, makeValidator } from 'envalid'

// Custom validator: non-empty string with minimum length
const secret = makeValidator<string>((value: string) => {
  if (typeof value !== 'string' || value.trim().length < 16) {
    throw new Error('Must be a non-empty string of at least 16 characters')
  }
  return value.trim()
})

// Custom validator: URL with ws:// or wss:// scheme
const wsUrl = makeValidator<string>((value: string) => {
  if (!/^wss?:\/\//.test(value)) {
    throw new Error('Must be a WebSocket URL starting with ws:// or wss://')
  }
  return value
})

// Custom validator: comma-separated list of origins (or '*')
const originList = makeValidator<string[]>((value: string) => {
  if (value === '*') return ['*']
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
})

export const config = cleanEnv(process.env, {
  // ── Server ────────────────────────────────────────────────────────────────
  NODE_ENV: str({
    choices: ['production', 'development', 'test'],
    default: 'production',
  }),
  GATEWAY_PORT: num({ default: 3100 }),
  GATEWAY_HOST: str({ default: '0.0.0.0' }),
  LOG_LEVEL: str({
    choices: ['fatal', 'error', 'warn', 'info', 'debug', 'trace'],
    default: 'info',
  }),

  // ── CORS ──────────────────────────────────────────────────────────────────
  CORS_ORIGINS: originList({ default: ['http://localhost:5173'] }),

  // ── LiveKit ───────────────────────────────────────────────────────────────
  LIVEKIT_API_KEY: secret(),
  LIVEKIT_API_SECRET: secret(),
  // Internal WS URL (server→server): used by SDK RoomServiceClient
  LIVEKIT_URL: wsUrl({ default: 'ws://livekit-server:7880' }),
  // Public WS URL handed to browser clients for connection
  LIVEKIT_PUBLIC_URL: wsUrl({ default: 'wss://live.yourdomain.com' }),
  // HMAC secret for verifying LiveKit webhook payloads
  LIVEKIT_WEBHOOK_HMAC_SECRET: secret(),

  // ── Redis ─────────────────────────────────────────────────────────────────
  REDIS_URL: str({ default: 'redis://redis:6379' }),

  // ── Supabase ──────────────────────────────────────────────────────────────
  SUPABASE_URL: str(),
  SUPABASE_SERVICE_ROLE_KEY: secret(),
  SUPABASE_JWT_SECRET: secret(),

  // ── Rate limits ───────────────────────────────────────────────────────────
  // Maximum requests per second per IP for general routes
  RATE_LIMIT_DEFAULT_RPS: num({ default: 10 }),
  // Maximum requests per second per IP for stream creation endpoint
  RATE_LIMIT_STREAM_CREATE_RPS: num({ default: 2 }),

  // ── Streaming ─────────────────────────────────────────────────────────────
  // Seconds after last heartbeat before a stream is auto-stopped
  HEARTBEAT_TIMEOUT_SEC: num({ default: 60 }),

  // ── Token TTL ─────────────────────────────────────────────────────────────
  // LiveKit publisher token TTL in seconds
  PUBLISHER_TOKEN_TTL_SEC: num({ default: 7200 }),
  // LiveKit viewer token TTL in seconds
  VIEWER_TOKEN_TTL_SEC: num({ default: 3600 }),
  // LiveKit guest token TTL in seconds
  GUEST_TOKEN_TTL_SEC: num({ default: 7200 }),

  // ── S3 / MinIO ────────────────────────────────────────────────────────────
  S3_ENDPOINT: str({ default: 'http://minio:9000' }),
  S3_ACCESS_KEY: str({ default: 'minioadmin' }),
  S3_SECRET_KEY: str({ default: 'minioadmin' }),
  S3_BUCKET_RECORDINGS: str({ default: 'livestream-recordings' }),
  S3_BUCKET_HLS: str({ default: 'livestream-hls' }),
  S3_REGION: str({ default: 'us-east-1' }),

  // ── Feature flags ─────────────────────────────────────────────────────────
  // Enable HLS egress recording for VOD
  FEATURE_VOD_RECORDING: bool({ default: true }),
  // Max concurrent guest slots in a Live Room
  MAX_GUEST_SLOTS: num({ default: 4 }),
})

export type Config = typeof config
