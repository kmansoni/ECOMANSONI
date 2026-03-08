/**
 * routes/stream-keys.ts — RTMP stream key management.
 *
 * Stream keys authenticate RTMP ingestion from OBS/Streamlabs.
 * Each user can have multiple keys (e.g., home, studio, mobile).
 * Keys are generated with crypto.randomBytes(32).toString('base64url')
 * per security requirements — 256 bits of entropy.
 *
 * Key values are returned ONLY on create and rotate.
 * List/GET operations return masked keys (first 8 chars + ***).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { randomBytes } from 'node:crypto'
import { uuidSchema, errorResponses } from '../schemas/common.schema.js'
import { ForbiddenError, NotFoundError, BadRequestError } from '../plugins/error-handler.js'

/** Maximum number of active stream keys a single user may hold. */
const MAX_STREAM_KEYS_PER_USER = 10

function generateStreamKey(): string {
  return randomBytes(32).toString('base64url')
}

function maskKey(keyValue: string): string {
  return `${keyValue.slice(0, 8)}***`
}

export async function streamKeyRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /api/v1/stream-keys — List user's keys ────────────────────────────
  app.get(
    '/',
    {
      schema: {
        summary: 'List stream keys for the authenticated user',
        tags: ['Stream Keys'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: uuidSchema,
                    label: { type: ['string', 'null'] },
                    key_masked: { type: 'string' },
                    is_active: { type: 'boolean' },
                    last_used_at: { type: ['string', 'null'] },
                    created_at: { type: 'string' },
                  },
                },
              },
            },
          },
          ...errorResponses,
        },
      },
      preHandler: [app.authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { data, error } = await app.supabase
        .from('live_stream_keys')
        .select('id, label, key_value, is_active, last_used_at, created_at')
        .eq('user_id', request.user!.id)
        .order('created_at', { ascending: false })

      if (error) throw new Error(`Failed to list stream keys: ${error.message}`)

      reply.send({
        data: (data ?? []).map((k: Record<string, unknown>) => ({
          id: k['id'],
          label: k['label'],
          key_masked: maskKey(k['key_value'] as string),
          is_active: k['is_active'],
          last_used_at: k['last_used_at'],
          created_at: k['created_at'],
        })),
      })
    },
  )

  // ── POST /api/v1/stream-keys — Create new key ──────────────────────────────
  app.post(
    '/',
    {
      schema: {
        summary: 'Create a new RTMP stream key',
        tags: ['Stream Keys'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            label: { type: 'string', maxLength: 100 },
          },
          additionalProperties: false,
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: uuidSchema,
              key_value: { type: 'string', description: 'Full key value — shown ONCE only' },
              label: { type: ['string', 'null'] },
              is_active: { type: 'boolean' },
              created_at: { type: 'string' },
            },
          },
          ...errorResponses,
        },
      },
      preHandler: [app.authenticate],
    },
    async (
      request: FastifyRequest<{ Body: { label?: string } }>,
      reply: FastifyReply,
    ) => {
      // Enforce per-user key cap to prevent unbounded DB growth.
      const { count, error: countError } = await app.supabase
        .from('live_stream_keys')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', request.user!.id)
        .eq('is_active', true)

      if (countError) throw new Error(`Failed to count stream keys: ${countError.message}`)

      if ((count ?? 0) >= MAX_STREAM_KEYS_PER_USER) {
        throw new BadRequestError(
          `Maximum ${MAX_STREAM_KEYS_PER_USER} active stream keys per user. ` +
          `Deactivate an existing key before creating a new one.`,
        )
      }

      const keyValue = generateStreamKey()

      const { data, error } = await app.supabase
        .from('live_stream_keys')
        .insert({
          user_id: request.user!.id,
          key_value: keyValue,
          label: request.body.label ?? null,
          is_active: true,
          created_at: new Date().toISOString(),
        })
        .select('id, key_value, label, is_active, created_at')
        .single()

      if (error || !data) throw new Error(`Failed to create stream key: ${error?.message ?? 'unknown'}`)

      reply.status(201).send(data)
    },
  )

  // ── POST /api/v1/stream-keys/:keyId/rotate — Rotate key ──────────────────
  app.post(
    '/:keyId/rotate',
    {
      schema: {
        summary: 'Rotate (replace) a stream key with a new value',
        tags: ['Stream Keys'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['keyId'],
          properties: { keyId: uuidSchema },
          additionalProperties: false,
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: uuidSchema,
              key_value: { type: 'string', description: 'New key value — shown ONCE only' },
              is_active: { type: 'boolean' },
            },
          },
          ...errorResponses,
        },
      },
      preHandler: [app.authenticate],
    },
    async (
      request: FastifyRequest<{ Params: { keyId: string } }>,
      reply: FastifyReply,
    ) => {
      // Verify ownership
      const { data: existing } = await app.supabase
        .from('live_stream_keys')
        .select('id, user_id')
        .eq('id', request.params.keyId)
        .single()

      if (!existing) throw new NotFoundError('Stream key', request.params.keyId)
      if ((existing as Record<string, unknown>)['user_id'] !== request.user!.id) {
        throw new ForbiddenError('This stream key does not belong to you')
      }

      const newKeyValue = generateStreamKey()

      const { data, error } = await app.supabase
        .from('live_stream_keys')
        .update({ key_value: newKeyValue, last_used_at: null })
        .eq('id', request.params.keyId)
        .select('id, key_value, is_active')
        .single()

      if (error || !data) throw new Error(`Failed to rotate key: ${error?.message ?? 'unknown'}`)

      // Invalidate the specific key in Redis cache.
      // redis.del() does NOT support glob patterns — use the exact key ID.
      // Pattern: ingress:key:<keyId> (set by ingress auth lookup on stream start).
      await app.redis.del(`ingress:key:${request.params.keyId}`)

      reply.send(data)
    },
  )

  // ── DELETE /api/v1/stream-keys/:keyId — Deactivate ──────────────────────
  app.delete(
    '/:keyId',
    {
      schema: {
        summary: 'Deactivate a stream key',
        tags: ['Stream Keys'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['keyId'],
          properties: { keyId: uuidSchema },
          additionalProperties: false,
        },
        response: { 200: { type: 'object', properties: { ok: { type: 'boolean' } } }, ...errorResponses },
      },
      preHandler: [app.authenticate],
    },
    async (
      request: FastifyRequest<{ Params: { keyId: string } }>,
      reply: FastifyReply,
    ) => {
      const { data: existing } = await app.supabase
        .from('live_stream_keys')
        .select('id, user_id')
        .eq('id', request.params.keyId)
        .single()

      if (!existing) throw new NotFoundError('Stream key', request.params.keyId)
      if ((existing as Record<string, unknown>)['user_id'] !== request.user!.id) {
        throw new ForbiddenError('This stream key does not belong to you')
      }

      const { error } = await app.supabase
        .from('live_stream_keys')
        .update({ is_active: false })
        .eq('id', request.params.keyId)

      if (error) throw new Error(`Failed to deactivate key: ${error.message}`)

      reply.send({ ok: true })
    },
  )
}
