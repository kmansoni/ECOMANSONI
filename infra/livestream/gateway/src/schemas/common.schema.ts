/**
 * schemas/common.schema.ts — Reusable JSON Schema fragments.
 */

export const uuidSchema = {
  type: 'string',
  format: 'uuid',
  description: 'UUID v4',
} as const

export const paginationQuerySchema = {
  type: 'object',
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    offset: { type: 'integer', minimum: 0, default: 0 },
  },
  additionalProperties: false,
} as const

export const problemDetailsSchema = {
  type: 'object',
  properties: {
    type: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'integer' },
    detail: { type: 'string' },
    instance: { type: 'string' },
    correlationId: { type: 'string' },
  },
  required: ['type', 'title', 'status', 'detail'],
} as const

export const errorResponses = {
  400: {
    description: 'Bad Request',
    content: { 'application/problem+json': { schema: problemDetailsSchema } },
  },
  401: {
    description: 'Unauthorized',
    content: { 'application/problem+json': { schema: problemDetailsSchema } },
  },
  403: {
    description: 'Forbidden',
    content: { 'application/problem+json': { schema: problemDetailsSchema } },
  },
  404: {
    description: 'Not Found',
    content: { 'application/problem+json': { schema: problemDetailsSchema } },
  },
  429: {
    description: 'Too Many Requests',
    content: { 'application/problem+json': { schema: problemDetailsSchema } },
  },
  500: {
    description: 'Internal Server Error',
    content: { 'application/problem+json': { schema: problemDetailsSchema } },
  },
} as const
