/**
 * routes/guests.ts — Guest (co-host) management endpoints.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import {
  inviteGuestSchema,
  acceptGuestSchema,
  declineGuestSchema,
  kickGuestSchema,
  listGuestsSchema,
} from '../schemas/guest.schema.js'
import { GuestService } from '../services/guest.service.js'
import { RoomService } from '../services/room.service.js'

export async function guestRoutes(app: FastifyInstance): Promise<void> {
  const roomService = new RoomService(app.livekit.roomService)
  const guestService = new GuestService(app.supabase, roomService)

  // ── POST /api/v1/streams/:sessionId/guests — Invite ────────────────────────
  app.post(
    '/',
    {
      schema: inviteGuestSchema,
      preHandler: [app.authenticate],
    },
    async (
      request: FastifyRequest<{
        Params: { sessionId: string }
        Body: { user_id: string }
      }>,
      reply: FastifyReply,
    ) => {
      const guest = await guestService.inviteGuest(
        request.params.sessionId,
        request.user!.id,
        request.body.user_id,
      )
      reply.status(201).send(guest)
    },
  )

  // ── POST /api/v1/streams/:sessionId/guests/:guestId/accept ─────────────────
  app.post(
    '/:guestId/accept',
    {
      schema: acceptGuestSchema,
      preHandler: [app.authenticate],
    },
    async (
      request: FastifyRequest<{ Params: { sessionId: string; guestId: string } }>,
      reply: FastifyReply,
    ) => {
      const guest = await guestService.acceptInvite(
        request.params.sessionId,
        request.params.guestId,
        request.user!.id,
      )
      reply.send(guest)
    },
  )

  // ── POST /api/v1/streams/:sessionId/guests/:guestId/decline ───────────────
  app.post(
    '/:guestId/decline',
    {
      schema: declineGuestSchema,
      preHandler: [app.authenticate],
    },
    async (
      request: FastifyRequest<{ Params: { sessionId: string; guestId: string } }>,
      reply: FastifyReply,
    ) => {
      const guest = await guestService.declineInvite(
        request.params.sessionId,
        request.params.guestId,
        request.user!.id,
      )
      reply.send(guest)
    },
  )

  // ── POST /api/v1/streams/:sessionId/guests/:guestId/kick ──────────────────
  app.post(
    '/:guestId/kick',
    {
      schema: kickGuestSchema,
      preHandler: [app.authenticate],
    },
    async (
      request: FastifyRequest<{ Params: { sessionId: string; guestId: string } }>,
      reply: FastifyReply,
    ) => {
      const guest = await guestService.kickGuest(
        request.params.sessionId,
        request.params.guestId,
        request.user!.id,
      )
      reply.send(guest)
    },
  )

  // ── GET /api/v1/streams/:sessionId/guests — List ──────────────────────────
  app.get(
    '/',
    {
      schema: listGuestsSchema,
      preHandler: [app.authenticate],
    },
    async (
      request: FastifyRequest<{ Params: { sessionId: string } }>,
      reply: FastifyReply,
    ) => {
      const guests = await guestService.listGuests(request.params.sessionId)
      reply.send({ data: guests })
    },
  )
}
