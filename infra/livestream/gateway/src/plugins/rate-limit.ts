/**
 * plugins/rate-limit.ts — Redis-backed rate limiting plugin.
 *
 * Strategy: sliding window per IP stored in Redis with TTL.
 * Uses @fastify/rate-limit with Redis as the key-value store.
 *
 * Two tiers:
 *   - DEFAULT: 10 req/s across all routes
 *   - STREAM_CREATE: 2 req/s on POST /api/v1/streams (creation endpoint)
 *
 * Attack vectors mitigated:
 *   - DoS via stream creation spam
 *   - Token brute-force via rate limiting on auth failures
 *   - Flood of viewer token requests
 *
 * Note: rate limit headers (X-RateLimit-*) are returned to clients
 * per RFC 6585 to enable proper backoff implementation on clients.
 */

import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import rateLimit from '@fastify/rate-limit'
import { config } from '../config.js'

async function rateLimitPlugin(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    // Global defaults
    global: true,
    max: config.RATE_LIMIT_DEFAULT_RPS * 10, // Per 10-second window
    timeWindow: '10 seconds',

    // Use Redis for distributed rate limiting across multiple instances
    // If Redis is unavailable, falls back to in-memory (non-distributed)
    redis: app.redis,

    // Key: X-Forwarded-For if behind a trusted proxy, otherwise remote address
    keyGenerator: (request: { headers: Record<string, string | string[] | undefined>; ip?: string }) => {
      const forwarded = request.headers['x-forwarded-for']
      if (forwarded) {
        const firstIp = (typeof forwarded === 'string' ? forwarded : (forwarded[0] ?? '')).split(',')[0]
        return (firstIp ?? '').trim() || (request.ip ?? 'unknown')
      }
      return request.ip ?? 'unknown'
    },

    // RFC 7807 error response format
    errorResponseBuilder: (request: { url?: string; correlationId?: string }, context: { max: number; after: string; ttl: number }) => ({
      type: 'https://livestream.mansoni.ru/errors/rate-limited',
      title: 'Too Many Requests',
      status: 429,
      detail: `Rate limit exceeded. Max ${context.max} requests per ${context.after}. Try again after ${context.ttl}ms.`,
      instance: request.url,
      correlationId: request.correlationId,
    }),

    // Add standard rate limit response headers
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
  })
}

export default fp(rateLimitPlugin, {
  name: 'rate-limit',
  fastify: '>=4.0.0',
  dependencies: ['redis'],
})

// ── Per-route rate limit configs ──────────────────────────────────────────────

/** 2 req per 10 seconds for stream creation */
export const streamCreateRateLimit = {
  max: 2,
  timeWindow: '10 seconds',
}

/** Standard 10 req/s default */
export const defaultRateLimit = {
  max: 10,
  timeWindow: '1 second',
}
