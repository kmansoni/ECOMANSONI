/**
 * schemas/token.schema.ts — JSON Schema for token endpoints.
 */

import { uuidSchema, errorResponses } from './common.schema.js'

const tokenResponseSchema = {
  type: 'object',
  properties: {
    token: { type: 'string', description: 'LiveKit JWT access token' },
    ws_url: { type: 'string', description: 'LiveKit WebSocket URL for client connection' },
  },
  required: ['token', 'ws_url'],
} as const

const sessionIdBodySchema = {
  type: 'object',
  required: ['session_id'],
  properties: {
    session_id: { ...uuidSchema, description: 'Live session UUID' },
  },
  additionalProperties: false,
} as const

export const publisherTokenSchema = {
  summary: 'Get publisher (host) token for a stream',
  tags: ['Tokens'],
  security: [{ bearerAuth: [] }],
  body: sessionIdBodySchema,
  response: {
    200: tokenResponseSchema,
    ...errorResponses,
  },
} as const

export const viewerTokenSchema = {
  summary: 'Get viewer token for a stream',
  tags: ['Tokens'],
  security: [{ bearerAuth: [] }],
  body: sessionIdBodySchema,
  response: {
    200: tokenResponseSchema,
    ...errorResponses,
  },
} as const

export const guestTokenSchema = {
  summary: 'Get guest (co-host) token for a stream',
  tags: ['Tokens'],
  security: [{ bearerAuth: [] }],
  body: sessionIdBodySchema,
  response: {
    200: {
      type: 'object',
      properties: {
        token: { type: 'string' },
        ws_url: { type: 'string' },
        slot_position: { type: 'integer', description: 'Guest slot index (1–4)' },
      },
      required: ['token', 'ws_url', 'slot_position'],
    },
    ...errorResponses,
  },
} as const
