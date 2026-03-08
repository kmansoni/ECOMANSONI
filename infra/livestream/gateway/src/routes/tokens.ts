/**
 * routes/tokens.ts — LiveKit token generation endpoints.
 *
 * Security:
 * - Publisher token: only issued to the stream host
 * - Viewer token: issued after verifying stream is live
 * - Guest token: issued after verifying invite is accepted
 *
 * Tokens are short-lived and scoped to a single room.
 * No server-side token storage — stateless generation.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { publisherTokenSchema, viewerTokenSchema, guestTokenSchema } from '../schemas/token.schema.js'
import { tokenService } from '../services/token.service.js'
import { GuestService } from '../services/guest.service.js'
import { RoomService } from '../services/room.service.js'
import { StreamService } from '../services/stream.service.js'
import { EgressService } from '../services/egress.service.js'
import { ForbiddenError, NotFoundError, ConflictError } from '../plugins/error-handler.js'

export async function tokenRoutes(app: FastifyInstance): Promise<void> {
  const roomService = new RoomService(app.livekit.roomService)
  const egressService = new EgressService(app.livekit.egressClient)
  const streamService = new StreamService(
    app.supabase,
    app.redis,
    roomService,
    egressService,
    app.log,
  )
  const guestService = new GuestService(app.supabase, roomService)

  // ── POST /api/v1/tokens/publisher ──────────────────────────────────────────
  app.post(
    '/publisher',
    {
      schema: publisherTokenSchema,
      preHandler: [app.authenticate],
    },
    async (
      request: FastifyRequest<{ Body: { session_id: string } }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user!.id
      const sessionId = request.body.session_id

      const session = await streamService.getSession(sessionId)
      if (!session) throw new NotFoundError('Stream session', sessionId)
      if (session.user_id !== userId) {
        throw new ForbiddenError('Publisher token can only be requested by the stream host')
      }
      if (!['created', 'live'].includes(session.status)) {
        throw new ConflictError(`Cannot get publisher token for stream in '${session.status}' status`)
      }

      const { token, wsUrl } = tokenService.generatePublisherToken(userId, session.room_name)
      reply.send({ token, ws_url: wsUrl })
    },
  )

  // ── POST /api/v1/tokens/viewer ─────────────────────────────────────────────
  app.post(
    '/viewer',
    {
      schema: viewerTokenSchema,
      preHandler: [app.authenticate],
    },
    async (
      request: FastifyRequest<{ Body: { session_id: string } }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user!.id
      const sessionId = request.body.session_id

      const session = await streamService.getSession(sessionId)
      if (!session) throw new NotFoundError('Stream session', sessionId)
      if (session.status !== 'live') {
        throw new ConflictError('Stream is not currently live')
      }

      // Check geo restrictions (if any)
      // Note: geo check would use request IP here in production
      // Geo enforcement is a placeholder for CDN-layer enforcement

      // Register viewer in DB (fire-and-forget, non-fatal).
      // DB column is `viewer_id` (not `user_id`) — live_viewers schema (20260224300000:63).
      // onConflict uses idx_live_viewers_session_viewer_unique (20260308000012).
      void app.supabase
        .from('live_viewers')
        .upsert(
          { session_id: sessionId, viewer_id: userId, joined_at: new Date().toISOString() },
          { onConflict: 'session_id,viewer_id' },
        )
        .then(({ error }) => {
          if (error) app.log.warn({ error, sessionId }, 'Failed to register viewer')
        })

      const { token, wsUrl } = tokenService.generateViewerToken(userId, session.room_name)
      reply.send({ token, ws_url: wsUrl })
    },
  )

  // ── POST /api/v1/tokens/guest ──────────────────────────────────────────────
  app.post(
    '/guest',
    {
      schema: guestTokenSchema,
      preHandler: [app.authenticate],
    },
    async (
      request: FastifyRequest<{ Body: { session_id: string } }>,
      reply: FastifyReply,
    ) => {
      const userId = request.user!.id
      const sessionId = request.body.session_id

      const session = await streamService.getSession(sessionId)
      if (!session) throw new NotFoundError('Stream session', sessionId)
      if (session.status !== 'live') {
        throw new ConflictError('Stream must be live to join as guest')
      }

      // Verify invite is accepted
      const slotPosition = await guestService.getGuestSlotPosition(sessionId, userId)
      if (slotPosition === null) {
        throw new ForbiddenError('No accepted guest invitation found for this session')
      }

      const { token, wsUrl } = tokenService.generateGuestToken(userId, session.room_name)
      reply.send({ token, ws_url: wsUrl, slot_position: slotPosition })
    },
  )
}
