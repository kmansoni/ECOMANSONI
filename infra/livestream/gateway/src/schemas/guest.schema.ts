/**
 * schemas/guest.schema.ts — JSON Schema for guest management endpoints.
 */

import { uuidSchema, errorResponses } from './common.schema.js'

const sessionAndGuestParams = {
  type: 'object',
  required: ['sessionId', 'guestId'],
  properties: {
    sessionId: { ...uuidSchema },
    guestId: { ...uuidSchema },
  },
  additionalProperties: false,
} as const

const guestResponseSchema = {
  type: 'object',
  properties: {
    id: uuidSchema,
    session_id: uuidSchema,
    host_user_id: uuidSchema,
    guest_user_id: uuidSchema,
    status: { type: 'string', enum: ['invited', 'accepted', 'declined', 'kicked', 'left'] },
    slot_position: { type: ['integer', 'null'] },
    invited_at: { type: 'string' },
    accepted_at: { type: ['string', 'null'] },
    left_at: { type: ['string', 'null'] },
  },
  required: ['id', 'session_id', 'host_user_id', 'guest_user_id', 'status', 'invited_at'],
} as const

export const inviteGuestSchema = {
  summary: 'Invite a user as a guest to the livestream',
  tags: ['Guests'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['sessionId'],
    properties: { sessionId: uuidSchema },
    additionalProperties: false,
  },
  body: {
    type: 'object',
    required: ['user_id'],
    properties: {
      user_id: { ...uuidSchema, description: 'User to invite as guest' },
    },
    additionalProperties: false,
  },
  response: {
    201: guestResponseSchema,
    ...errorResponses,
  },
} as const

export const acceptGuestSchema = {
  summary: 'Accept a guest invitation',
  tags: ['Guests'],
  security: [{ bearerAuth: [] }],
  params: sessionAndGuestParams,
  response: {
    200: guestResponseSchema,
    ...errorResponses,
  },
} as const

export const declineGuestSchema = {
  summary: 'Decline a guest invitation',
  tags: ['Guests'],
  security: [{ bearerAuth: [] }],
  params: sessionAndGuestParams,
  response: {
    200: guestResponseSchema,
    ...errorResponses,
  },
} as const

export const kickGuestSchema = {
  summary: 'Kick a guest from the stream',
  tags: ['Guests'],
  security: [{ bearerAuth: [] }],
  params: sessionAndGuestParams,
  response: {
    200: guestResponseSchema,
    ...errorResponses,
  },
} as const

export const listGuestsSchema = {
  summary: 'List guests for a stream session',
  tags: ['Guests'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['sessionId'],
    properties: { sessionId: uuidSchema },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        data: { type: 'array', items: guestResponseSchema },
      },
      required: ['data'],
    },
    ...errorResponses,
  },
} as const
