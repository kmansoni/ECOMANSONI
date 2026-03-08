/**
 * routes/analytics.ts — Stream analytics endpoints.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { AnalyticsService } from '../services/analytics.service.js'
import { uuidSchema, errorResponses } from '../schemas/common.schema.js'

const sessionIdParams = {
  type: 'object',
  required: ['sessionId'],
  properties: { sessionId: uuidSchema },
  additionalProperties: false,
}

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  const analyticsService = new AnalyticsService(app.supabase, app.redis)

  // ── GET /api/v1/streams/:sessionId/analytics ──────────────────────────────
  app.get(
    '/',
    {
      schema: {
        summary: 'Get full analytics for a stream session',
        tags: ['Analytics'],
        security: [{ bearerAuth: [] }],
        params: sessionIdParams,
        response: {
          200: {
            type: 'object',
            properties: {
              session_id: uuidSchema,
              total_viewers: { type: 'integer' },
              unique_viewers: { type: 'integer' },
              peak_concurrent_viewers: { type: 'integer' },
              average_watch_time_sec: { type: 'integer' },
              total_watch_time_sec: { type: 'integer' },
              total_chat_messages: { type: 'integer' },
              total_reactions: { type: 'integer' },
              total_donations: { type: 'number' },
              duration_sec: { type: ['integer', 'null'] },
            },
          },
          ...errorResponses,
        },
      },
      preHandler: [app.authenticate],
    },
    async (
      request: FastifyRequest<{ Params: { sessionId: string } }>,
      reply: FastifyReply,
    ) => {
      const analytics = await analyticsService.getStreamAnalytics(
        request.params.sessionId,
        request.user!.id,
      )
      reply.send(analytics)
    },
  )

  // ── GET /api/v1/streams/:sessionId/analytics/realtime ─────────────────────
  app.get(
    '/realtime',
    {
      schema: {
        summary: 'Get real-time metrics for a live stream',
        tags: ['Analytics'],
        security: [{ bearerAuth: [] }],
        params: sessionIdParams,
        response: {
          200: {
            type: 'object',
            properties: {
              session_id: uuidSchema,
              current_viewers: { type: 'integer' },
              chat_messages_per_minute: { type: 'integer' },
              reactions_per_minute: { type: 'integer' },
              is_live: { type: 'boolean' },
              started_at: { type: ['string', 'null'] },
              elapsed_sec: { type: 'integer' },
            },
          },
          ...errorResponses,
        },
      },
      preHandler: [app.authenticate],
    },
    async (
      request: FastifyRequest<{ Params: { sessionId: string } }>,
      reply: FastifyReply,
    ) => {
      const metrics = await analyticsService.getRealtimeMetrics(
        request.params.sessionId,
        request.user!.id,
      )
      reply.send(metrics)
    },
  )
}
