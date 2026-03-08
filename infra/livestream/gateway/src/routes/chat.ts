/**
 * routes/chat.ts — Chat moderation endpoints.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { ModerationService } from '../services/moderation.service.js'
import { uuidSchema, errorResponses } from '../schemas/common.schema.js'
import type { ModeratorPermission } from '../types/index.js'

const sessionIdParams = {
  type: 'object',
  required: ['sessionId'],
  properties: { sessionId: uuidSchema },
  additionalProperties: false,
}

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  const modService = new ModerationService(app.supabase)

  // ── POST /api/v1/streams/:sessionId/chat/ban ──────────────────────────────
  app.post(
    '/ban',
    {
      schema: {
        summary: 'Ban a user from chat',
        tags: ['Chat Moderation'],
        security: [{ bearerAuth: [] }],
        params: sessionIdParams,
        body: {
          type: 'object',
          required: ['user_id'],
          properties: {
            user_id: uuidSchema,
            reason: { type: 'string', maxLength: 500 },
            duration_minutes: { type: 'integer', minimum: 1, maximum: 43200 },
          },
          additionalProperties: false,
        },
        response: { 200: { type: 'object', properties: { ok: { type: 'boolean' } } }, ...errorResponses },
      },
      preHandler: [app.authenticate],
    },
    async (
      request: FastifyRequest<{
        Params: { sessionId: string }
        Body: { user_id: string; reason?: string; duration_minutes?: number }
      }>,
      reply: FastifyReply,
    ) => {
      await modService.banUser(
        request.params.sessionId,
        request.user!.id,
        request.body.user_id,
        request.body.reason,
        request.body.duration_minutes,
      )
      reply.send({ ok: true })
    },
  )

  // ── POST /api/v1/streams/:sessionId/chat/unban ────────────────────────────
  app.post(
    '/unban',
    {
      schema: {
        summary: 'Unban a user from chat',
        tags: ['Chat Moderation'],
        security: [{ bearerAuth: [] }],
        params: sessionIdParams,
        body: {
          type: 'object',
          required: ['user_id'],
          properties: { user_id: uuidSchema },
          additionalProperties: false,
        },
        response: { 200: { type: 'object', properties: { ok: { type: 'boolean' } } }, ...errorResponses },
      },
      preHandler: [app.authenticate],
    },
    async (
      request: FastifyRequest<{
        Params: { sessionId: string }
        Body: { user_id: string }
      }>,
      reply: FastifyReply,
    ) => {
      await modService.unbanUser(
        request.params.sessionId,
        request.user!.id,
        request.body.user_id,
      )
      reply.send({ ok: true })
    },
  )

  // ── DELETE /api/v1/streams/:sessionId/chat/messages/:messageId ────────────
  app.delete(
    '/messages/:messageId',
    {
      schema: {
        summary: 'Delete a chat message',
        tags: ['Chat Moderation'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['sessionId', 'messageId'],
          properties: { sessionId: uuidSchema, messageId: uuidSchema },
          additionalProperties: false,
        },
        response: { 200: { type: 'object', properties: { ok: { type: 'boolean' } } }, ...errorResponses },
      },
      preHandler: [app.authenticate],
    },
    async (
      request: FastifyRequest<{ Params: { sessionId: string; messageId: string } }>,
      reply: FastifyReply,
    ) => {
      await modService.deleteMessage(
        request.params.sessionId,
        request.params.messageId,
        request.user!.id,
      )
      reply.send({ ok: true })
    },
  )

  // ── POST /api/v1/streams/:sessionId/chat/pin ──────────────────────────────
  app.post(
    '/pin',
    {
      schema: {
        summary: 'Pin a chat message',
        tags: ['Chat Moderation'],
        security: [{ bearerAuth: [] }],
        params: sessionIdParams,
        body: {
          type: 'object',
          required: ['message_id'],
          properties: { message_id: uuidSchema },
          additionalProperties: false,
        },
        response: { 200: { type: 'object', properties: { ok: { type: 'boolean' } } }, ...errorResponses },
      },
      preHandler: [app.authenticate],
    },
    async (
      request: FastifyRequest<{
        Params: { sessionId: string }
        Body: { message_id: string }
      }>,
      reply: FastifyReply,
    ) => {
      await modService.pinMessage(
        request.params.sessionId,
        request.body.message_id,
        request.user!.id,
      )
      reply.send({ ok: true })
    },
  )

  // ── POST /api/v1/streams/:sessionId/chat/moderators ───────────────────────
  app.post(
    '/moderators',
    {
      schema: {
        summary: 'Assign a chat moderator',
        tags: ['Chat Moderation'],
        security: [{ bearerAuth: [] }],
        params: sessionIdParams,
        body: {
          type: 'object',
          required: ['user_id', 'permissions'],
          properties: {
            user_id: uuidSchema,
            permissions: {
              type: 'array',
              items: { type: 'string', enum: ['ban_user', 'delete_message', 'pin_message', 'all'] },
              minItems: 1,
            },
          },
          additionalProperties: false,
        },
        response: { 201: { type: 'object' }, ...errorResponses },
      },
      preHandler: [app.authenticate],
    },
    async (
      request: FastifyRequest<{
        Params: { sessionId: string }
        Body: { user_id: string; permissions: ModeratorPermission[] }
      }>,
      reply: FastifyReply,
    ) => {
      const mod = await modService.assignModerator(
        request.params.sessionId,
        request.user!.id,
        request.body.user_id,
        request.body.permissions,
      )
      reply.status(201).send(mod)
    },
  )
}
