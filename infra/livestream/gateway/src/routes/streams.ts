/**
 * routes/streams.ts — Stream lifecycle endpoints.
 *
 * All state transitions are enforced server-side in stream.service.ts.
 * Route layer: validate input, authenticate, delegate to service.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import {
  createStreamSchema,
  startStreamSchema,
  stopStreamSchema,
  listActiveStreamsSchema,
  getStreamSchema,
  heartbeatSchema,
} from '../schemas/stream.schema.js'
import { StreamService } from '../services/stream.service.js'
import { RoomService } from '../services/room.service.js'
import { EgressService } from '../services/egress.service.js'
import { streamCreateRateLimit } from '../plugins/rate-limit.js'

export async function streamRoutes(app: FastifyInstance): Promise<void> {
  const streamService = new StreamService(
    app.supabase,
    app.redis,
    new RoomService(app.livekit.roomService),
    new EgressService(app.livekit.egressClient),
    app.log,
  )

  // ── POST /api/v1/streams — Create stream ───────────────────────────────────
  app.post(
    '/',
    {
      schema: createStreamSchema,
      preHandler: [app.authenticate],
      config: { rateLimit: streamCreateRateLimit },
    },
    async (
      request: FastifyRequest<{
        Body: {
          title: string
          description?: string
          category?: string
          tags?: string[]
          is_mature_content?: boolean
          language?: string
          geo_restrictions?: string[]
          scheduled_at?: string
        }
      }>,
      reply: FastifyReply,
    ) => {
      const user = request.user!
      const result = await streamService.createStream({
        userId: user.id,
        title: request.body.title,
        description: request.body.description,
        category: request.body.category,
        tags: request.body.tags,
        isMatureContent: request.body.is_mature_content,
        language: request.body.language,
        geoRestrictions: request.body.geo_restrictions,
        scheduledAt: request.body.scheduled_at,
      })

      reply.status(201).send({
        session_id: result.sessionId,
        room_name: result.roomName,
        status: result.status,
      })
    },
  )

  // ── POST /api/v1/streams/:sessionId/start ──────────────────────────────────
  app.post(
    '/:sessionId/start',
    {
      schema: startStreamSchema,
      preHandler: [app.authenticate],
    },
    async (
      request: FastifyRequest<{ Params: { sessionId: string } }>,
      reply: FastifyReply,
    ) => {
      const result = await streamService.startStream(
        request.params.sessionId,
        request.user!.id,
      )
      reply.send(result)
    },
  )

  // ── POST /api/v1/streams/:sessionId/stop ───────────────────────────────────
  app.post(
    '/:sessionId/stop',
    {
      schema: stopStreamSchema,
      preHandler: [app.authenticate],
    },
    async (
      request: FastifyRequest<{ Params: { sessionId: string } }>,
      reply: FastifyReply,
    ) => {
      const result = await streamService.stopStream(
        request.params.sessionId,
        request.user!.id,
      )
      reply.send({
        status: result.status,
        duration_sec: result.durationSec,
        replay_url: result.replayUrl,
      })
    },
  )

  // ── GET /api/v1/streams/active — List active streams ───────────────────────
  app.get(
    '/active',
    {
      schema: listActiveStreamsSchema,
      preHandler: [app.optionalAuthenticate],
    },
    async (
      request: FastifyRequest<{
        Querystring: {
          limit?: number
          offset?: number
          category?: string
          language?: string
        }
      }>,
      reply: FastifyReply,
    ) => {
      const limit = Math.min(request.query.limit ?? 20, 100)
      const offset = request.query.offset ?? 0

      const result = await streamService.listActiveStreams({
        limit,
        offset,
        category: request.query.category,
        language: request.query.language,
      })

      reply.send({
        data: result.data,
        total: result.total,
        limit,
        offset,
      })
    },
  )

  // ── GET /api/v1/streams/:sessionId — Get stream details ───────────────────
  app.get(
    '/:sessionId',
    {
      schema: getStreamSchema,
      preHandler: [app.optionalAuthenticate],
    },
    async (
      request: FastifyRequest<{ Params: { sessionId: string } }>,
      reply: FastifyReply,
    ) => {
      const session = await streamService.getSession(request.params.sessionId)
      if (!session) {
        const { NotFoundError: NFE } = await import('../plugins/error-handler.js')
        throw new NFE('Stream session', request.params.sessionId)
      }

      reply.send(session)
    },
  )

  // ── POST /api/v1/streams/:sessionId/heartbeat ─────────────────────────────
  app.post(
    '/:sessionId/heartbeat',
    {
      schema: heartbeatSchema,
      preHandler: [app.authenticate],
    },
    async (
      request: FastifyRequest<{ Params: { sessionId: string } }>,
      reply: FastifyReply,
    ) => {
      const result = await streamService.heartbeat(
        request.params.sessionId,
        request.user!.id,
      )
      reply.send({ ok: true, next_heartbeat_in_sec: result.nextHeartbeatInSec })
    },
  )
}
