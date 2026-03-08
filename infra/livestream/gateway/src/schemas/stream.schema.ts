/**
 * schemas/stream.schema.ts — JSON Schema for stream endpoints.
 */

import { uuidSchema, paginationQuerySchema, errorResponses } from './common.schema.js'

// ── Shared properties ─────────────────────────────────────────────────────────

const sessionIdParams = {
  type: 'object',
  required: ['sessionId'],
  properties: {
    sessionId: { ...uuidSchema, description: 'Live session UUID' },
  },
  additionalProperties: false,
} as const

const liveSessionResponseSchema = {
  type: 'object',
  properties: {
    id: uuidSchema,
    user_id: uuidSchema,
    title: { type: 'string' },
    description: { type: ['string', 'null'] },
    category: { type: ['string', 'null'] },
    tags: { type: 'array', items: { type: 'string' } },
    is_mature_content: { type: 'boolean' },
    language: { type: ['string', 'null'] },
    geo_restrictions: { type: 'array', items: { type: 'string' } },
    status: { type: 'string', enum: ['created', 'live', 'ended', 'cancelled'] },
    room_name: { type: 'string' },
    scheduled_at: { type: ['string', 'null'] },
    actual_start_at: { type: ['string', 'null'] },
    actual_end_at: { type: ['string', 'null'] },
    viewer_count: { type: 'integer' },
    peak_viewer_count: { type: 'integer' },
    replay_url: { type: ['string', 'null'] },
    hls_url: { type: ['string', 'null'] },
    thumbnail_url: { type: ['string', 'null'] },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
  required: ['id', 'user_id', 'title', 'status', 'room_name', 'created_at'],
} as const

// ── POST /streams ─────────────────────────────────────────────────────────────

export const createStreamSchema = {
  summary: 'Create a new livestream session',
  tags: ['Streams'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['title'],
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 255 },
      description: { type: 'string', maxLength: 2000 },
      category: { type: 'string', maxLength: 100 },
      tags: { type: 'array', items: { type: 'string', maxLength: 50 }, maxItems: 20 },
      is_mature_content: { type: 'boolean', default: false },
      language: { type: 'string', minLength: 2, maxLength: 10 },
      geo_restrictions: { type: 'array', items: { type: 'string', minLength: 2, maxLength: 3 }, maxItems: 250 },
      scheduled_at: { type: 'string', format: 'date-time' },
    },
    additionalProperties: false,
  },
  response: {
    201: {
      description: 'Stream session created',
      type: 'object',
      properties: {
        session_id: uuidSchema,
        room_name: { type: 'string' },
        status: { type: 'string', enum: ['created'] },
      },
      required: ['session_id', 'room_name', 'status'],
    },
    ...errorResponses,
  },
} as const

// ── POST /streams/:sessionId/start ────────────────────────────────────────────

export const startStreamSchema = {
  summary: 'Start the livestream (transition to live)',
  tags: ['Streams'],
  security: [{ bearerAuth: [] }],
  params: sessionIdParams,
  response: {
    200: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['live'] },
        started_at: { type: 'string' },
      },
      required: ['status', 'started_at'],
    },
    ...errorResponses,
  },
} as const

// ── POST /streams/:sessionId/stop ─────────────────────────────────────────────

export const stopStreamSchema = {
  summary: 'Stop the livestream',
  tags: ['Streams'],
  security: [{ bearerAuth: [] }],
  params: sessionIdParams,
  response: {
    200: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['ended'] },
        duration_sec: { type: ['integer', 'null'] },
        replay_url: { type: ['string', 'null'] },
      },
      required: ['status'],
    },
    ...errorResponses,
  },
} as const

// ── GET /streams/active ───────────────────────────────────────────────────────

export const listActiveStreamsSchema = {
  summary: 'List active livestreams',
  tags: ['Streams'],
  querystring: {
    type: 'object',
    properties: {
      ...paginationQuerySchema.properties,
      category: { type: 'string', maxLength: 100 },
      language: { type: 'string', maxLength: 10 },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        data: { type: 'array', items: liveSessionResponseSchema },
        total: { type: 'integer' },
        limit: { type: 'integer' },
        offset: { type: 'integer' },
      },
      required: ['data', 'total', 'limit', 'offset'],
    },
    ...errorResponses,
  },
} as const

// ── GET /streams/:sessionId ───────────────────────────────────────────────────

export const getStreamSchema = {
  summary: 'Get stream session details',
  tags: ['Streams'],
  params: sessionIdParams,
  response: {
    200: {
      ...liveSessionResponseSchema,
      properties: {
        ...liveSessionResponseSchema.properties,
        analytics: {
          type: ['object', 'null'],
          properties: {
            current_viewers: { type: 'integer' },
            peak_concurrent_viewers: { type: 'integer' },
            total_chat_messages: { type: 'integer' },
          },
        },
      },
    },
    ...errorResponses,
  },
} as const

// ── POST /streams/:sessionId/heartbeat ────────────────────────────────────────

export const heartbeatSchema = {
  summary: 'Send streamer heartbeat',
  tags: ['Streams'],
  security: [{ bearerAuth: [] }],
  params: sessionIdParams,
  response: {
    200: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        next_heartbeat_in_sec: { type: 'integer' },
      },
      required: ['ok', 'next_heartbeat_in_sec'],
    },
    ...errorResponses,
  },
} as const
