/**
 * plugins/error-handler.ts — Centralized RFC 7807 Problem Details error handler.
 *
 * All unhandled errors are normalized to ProblemDetails format.
 * Correlation IDs are injected from request context.
 * Internal error details are never leaked to the client in production.
 */

import type { FastifyInstance, FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'

export class AppError extends Error {
  public readonly statusCode: number
  public readonly type: string
  public readonly detail: string

  constructor(statusCode: number, type: string, message: string, detail?: string) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.type = type
    this.detail = detail ?? message
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      404,
      'https://livestream.mansoni.ru/errors/not-found',
      `${resource} not found`,
      id ? `${resource} with id '${id}' was not found` : `${resource} was not found`,
    )
  }
}

export class UnauthorizedError extends AppError {
  constructor(detail = 'Authentication required') {
    super(401, 'https://livestream.mansoni.ru/errors/unauthorized', 'Unauthorized', detail)
  }
}

export class ForbiddenError extends AppError {
  constructor(detail = 'Insufficient permissions') {
    super(403, 'https://livestream.mansoni.ru/errors/forbidden', 'Forbidden', detail)
  }
}

export class BadRequestError extends AppError {
  constructor(detail: string) {
    super(400, 'https://livestream.mansoni.ru/errors/bad-request', 'Bad Request', detail)
  }
}

export class ConflictError extends AppError {
  constructor(detail: string) {
    super(409, 'https://livestream.mansoni.ru/errors/conflict', 'Conflict', detail)
  }
}

export class ValidationError extends AppError {
  constructor(detail: string) {
    super(422, 'https://livestream.mansoni.ru/errors/validation', 'Validation Error', detail)
  }
}

export class TooManyRequestsError extends AppError {
  constructor(detail = 'Rate limit exceeded') {
    super(429, 'https://livestream.mansoni.ru/errors/rate-limited', 'Too Many Requests', detail)
  }
}

async function errorHandlerPlugin(app: FastifyInstance): Promise<void> {
  app.setErrorHandler(
    (error: FastifyError | AppError | Error, request: FastifyRequest, reply: FastifyReply) => {
      const correlationId = request.correlationId

      // Fastify validation error (400)
      if ('validation' in error && error.validation != null) {
        const detail = (error as FastifyError).message
        reply
          .status(400)
          .header('Content-Type', 'application/problem+json')
          .send({
            type: 'https://livestream.mansoni.ru/errors/validation',
            title: 'Bad Request',
            status: 400,
            detail,
            instance: request.url,
            correlationId,
          })
        return
      }

      // Rate limit error from @fastify/rate-limit
      if ('statusCode' in error && (error as FastifyError).statusCode === 429) {
        reply
          .status(429)
          .header('Content-Type', 'application/problem+json')
          .send({
            type: 'https://livestream.mansoni.ru/errors/rate-limited',
            title: 'Too Many Requests',
            status: 429,
            detail: 'You have exceeded the request rate limit. Please slow down.',
            instance: request.url,
            correlationId,
          })
        return
      }

      // Known application error
      if (error instanceof AppError) {
        reply
          .status(error.statusCode)
          .header('Content-Type', 'application/problem+json')
          .send({
            type: error.type,
            title: error.message,
            status: error.statusCode,
            detail: error.detail,
            instance: request.url,
            correlationId,
          })
        return
      }

      // Unknown/unexpected error — do not leak internals in production
      const isProd = process.env['NODE_ENV'] === 'production'
      const statusCode = 'statusCode' in error ? (error as FastifyError).statusCode ?? 500 : 500

      app.log.error({ err: error, correlationId, url: request.url }, 'Unhandled error')

      reply
        .status(statusCode)
        .header('Content-Type', 'application/problem+json')
        .send({
          type: 'https://livestream.mansoni.ru/errors/internal',
          title: 'Internal Server Error',
          status: statusCode,
          detail: isProd ? 'An unexpected error occurred' : (error.message ?? 'Unknown error'),
          instance: request.url,
          correlationId,
        })
    },
  )

  // 404 handler for unknown routes
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    reply
      .status(404)
      .header('Content-Type', 'application/problem+json')
      .send({
        type: 'https://livestream.mansoni.ru/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Route ${request.method} ${request.url} not found`,
        instance: request.url,
        correlationId: request.correlationId,
      })
  })
}

// Using a simple workaround since fastify-plugin may not be installed yet
// fp wraps the plugin to share the same scope with the parent instance
export default fp(errorHandlerPlugin, {
  name: 'error-handler',
  fastify: '>=4.0.0',
})
