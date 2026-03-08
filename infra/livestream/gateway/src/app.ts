/**
 * app.ts — Fastify application factory.
 *
 * Plugin registration order matters (Fastify DI model):
 * 1. Core plugins (cors, sensible)
 * 2. Error handler (must be before routes)
 * 3. Infrastructure plugins (redis, supabase, livekit)
 * 4. Rate limiting (depends on redis)
 * 5. Auth plugin (stateless — no deps)
 * 6. Swagger (before routes for discovery)
 * 7. Request correlation ID hook
 * 8. Routes
 *
 * Zero-trust request pipeline:
 *   ─── preValidation: correlation ID ──►
 *   ─── validation (JSON Schema) ──────►
 *   ─── preHandler: auth / rate limit ─►
 *   ─── handler ───────────────────────►
 *   ─── onSend: sanitize response ─────►
 *   ─── onError: RFC 7807 format ──────►
 */

import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { randomUUID } from 'node:crypto'
import { config } from './config.js'

// Plugins
import errorHandlerPlugin from './plugins/error-handler.js'
import redisPlugin from './plugins/redis.js'
import supabasePlugin from './plugins/supabase.js'
import livekitPlugin from './plugins/livekit.js'
import rateLimitPlugin from './plugins/rate-limit.js'
import authPlugin from './plugins/auth.js'

// Routes
import { healthRoutes } from './routes/health.js'
import { streamRoutes } from './routes/streams.js'
import { tokenRoutes } from './routes/tokens.js'
import { guestRoutes } from './routes/guests.js'
import { chatRoutes } from './routes/chat.js'
import { streamKeyRoutes } from './routes/stream-keys.js'
import { webhookRoutes } from './routes/webhooks.js'
import { analyticsRoutes } from './routes/analytics.js'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      ...(config.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
        : {}),
    },
    // Generate request ID for correlation tracking
    genReqId: () => randomUUID(),
    // Trust X-Forwarded-* headers from nginx proxy
    trustProxy: true,
    // Ajv options for strict JSON Schema validation
    ajv: {
      customOptions: {
        removeAdditional: false,
        useDefaults: true,
        coerceTypes: false,
        allErrors: false,
      },
    },
  })

  // ── 1. Error handler (first — catches plugin errors too) ─────────────────
  await app.register(errorHandlerPlugin)

  // ── 2. CORS ───────────────────────────────────────────────────────────────
  // Security: credentials=true + wildcard origin is forbidden by the Fetch spec
  // and allows any origin to make credentialed cross-origin requests.
  // In production CORS_ORIGINS must be an explicit list — never '*'.
  // If somehow '*' is set, we disable credentials to prevent the exploit.
  const hasWildcard = config.CORS_ORIGINS.includes('*')
  await app.register(cors, {
    origin: hasWildcard ? false : config.CORS_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    // credentials must never be paired with wildcard origin
    credentials: !hasWildcard,
    maxAge: 86400,
  })
  if (hasWildcard && config.NODE_ENV === 'production') {
    // Fail-fast in production if wildcard CORS is misconfigured.
    // In development a warning is emitted and the server still starts.
    throw new Error(
      'CORS_ORIGINS=* is not allowed in production. ' +
      'Set CORS_ORIGINS to an explicit comma-separated list of allowed origins.',
    )
  }
  if (hasWildcard) {
    app.log.warn('CORS_ORIGINS=* detected — credentials disabled to prevent wildcard+credentials exploit')
  }

  // ── 3. Infrastructure plugins ─────────────────────────────────────────────
  await app.register(redisPlugin)
  await app.register(supabasePlugin)
  await app.register(livekitPlugin)

  // ── 4. Rate limiting (depends on redis) ───────────────────────────────────
  await app.register(rateLimitPlugin)

  // ── 5. Auth ───────────────────────────────────────────────────────────────
  await app.register(authPlugin)

  // ── 6. OpenAPI / Swagger ──────────────────────────────────────────────────
  if (config.NODE_ENV !== 'production') {
    await app.register(swagger, {
      openapi: {
        openapi: '3.0.3',
        info: {
          title: 'ECOMANSONI Livestream Gateway API',
          description: 'API for managing livestream sessions, tokens, guests, and moderation',
          version: '1.0.0',
        },
        servers: [
          { url: 'http://localhost:3100', description: 'Local development' },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
              description: 'Supabase JWT token',
            },
          },
        },
        tags: [
          { name: 'Health', description: 'Health and readiness probes' },
          { name: 'Streams', description: 'Stream lifecycle management' },
          { name: 'Tokens', description: 'LiveKit token generation' },
          { name: 'Guests', description: 'Co-host/guest management' },
          { name: 'Chat Moderation', description: 'Chat moderation operations' },
          { name: 'Stream Keys', description: 'RTMP stream key management' },
          { name: 'Webhooks', description: 'LiveKit webhook receiver' },
          { name: 'Analytics', description: 'Stream analytics and metrics' },
        ],
      },
    })

    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
      },
    })
  }

  // ── 7. Request correlation ID hook ────────────────────────────────────────
  // Security: the X-Correlation-Id value originates from an untrusted client.
  // We validate format (alphanumeric + hyphen, max 64 chars) before using it
  // in logs to prevent log injection and log-flooding attacks.
  // Regex: only [A-Za-z0-9\-] allowed — no newlines, control chars, or JSON fragments.
  const CORRELATION_ID_RE = /^[\w\-]{1,64}$/

  app.addHook('onRequest', async (request) => {
    const raw = request.headers['x-correlation-id']
    const clientCorrelationId =
      typeof raw === 'string' && CORRELATION_ID_RE.test(raw) ? raw : null
    const correlationId = clientCorrelationId ?? (request.id as string)

    // @ts-expect-error — augmented type (declared in types/index.ts, resolved after npm install)
    request.correlationId = correlationId
    request.log.info({ method: request.method, url: request.url, correlationId }, 'Incoming request')
  })

  app.addHook('onResponse', async (request, reply) => {
    request.log.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
        // @ts-expect-error — augmented type
        correlationId: request.correlationId,
      },
      'Request completed',
    )
  })

  // ── 8. Routes ─────────────────────────────────────────────────────────────

  // Health routes at root level (not versioned — used by k8s/docker)
  await app.register(healthRoutes)

  // API v1 routes
  await app.register(
    async (api) => {
      await api.register(streamRoutes, { prefix: '/streams' })
      await api.register(tokenRoutes, { prefix: '/tokens' })
      await api.register(streamKeyRoutes, { prefix: '/stream-keys' })
      await api.register(webhookRoutes, { prefix: '/webhooks' })

      // Nested routes under /streams/:sessionId
      await api.register(
        async (sessionScoped) => {
          await sessionScoped.register(guestRoutes, { prefix: '/:sessionId/guests' })
          await sessionScoped.register(chatRoutes, { prefix: '/:sessionId/chat' })
          await sessionScoped.register(analyticsRoutes, { prefix: '/:sessionId/analytics' })
        },
        { prefix: '/streams' },
      )
    },
    { prefix: '/api/v1' },
  )

  return app
}
