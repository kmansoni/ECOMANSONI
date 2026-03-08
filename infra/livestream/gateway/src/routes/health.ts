/**
 * routes/health.ts — Health and readiness probes.
 *
 * GET /health — Liveness probe: always 200 if process is running.
 * GET /ready  — Readiness probe: checks Redis + LiveKit + Supabase.
 *
 * Kubernetes uses liveness to restart crashed pods.
 * Readiness removes pod from load balancer if dependencies are down.
 * Design: never throw 500 on /ready — always return 200/503 with details.
 */

import type { FastifyInstance } from 'fastify'

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // Liveness probe: if this 500s, the process is dead anyway
  app.get(
    '/health',
    {
      schema: {
        summary: 'Liveness probe',
        tags: ['Health'],
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              service: { type: 'string' },
              version: { type: 'string' },
              uptime: { type: 'number' },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      reply.send({
        ok: true,
        service: 'livestream-gateway',
        version: process.env['npm_package_version'] ?? '1.0.0',
        uptime: process.uptime(),
      })
    },
  )

  // Readiness probe: checks all external dependencies
  app.get(
    '/ready',
    {
      schema: {
        summary: 'Readiness probe',
        tags: ['Health'],
        response: {
          200: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              checks: {
                type: 'object',
                properties: {
                  redis: { type: 'string' },
                  supabase: { type: 'string' },
                  livekit: { type: 'string' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              checks: { type: 'object' },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      const checks: Record<string, string> = {}
      let allHealthy = true

      // Redis check
      try {
        const pong = await app.redis.ping()
        checks['redis'] = pong === 'PONG' ? 'ok' : 'error'
        if (checks['redis'] !== 'ok') allHealthy = false
      } catch (err: unknown) {
        checks['redis'] = `error: ${err instanceof Error ? err.message : 'unknown'}`
        allHealthy = false
      }

      // Supabase check: minimal query
      try {
        const { error } = await app.supabase.from('live_sessions').select('id').limit(1)
        checks['supabase'] = error ? `error: ${error.message}` : 'ok'
        if (checks['supabase'] !== 'ok') allHealthy = false
      } catch (err: unknown) {
        checks['supabase'] = `error: ${err instanceof Error ? err.message : 'unknown'}`
        allHealthy = false
      }

      // LiveKit check: list rooms (lightweight API call)
      try {
        await app.livekit.roomService.listRooms()
        checks['livekit'] = 'ok'
      } catch (err: unknown) {
        checks['livekit'] = `error: ${err instanceof Error ? err.message : 'unknown'}`
        allHealthy = false
      }

      const statusCode = allHealthy ? 200 : 503
      reply.status(statusCode).send({ ok: allHealthy, checks })
    },
  )
}
