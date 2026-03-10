/**
 * error-handler.ts — Global Fastify error handler.
 *
 * Maps domain errors, Zod validation errors, and pg constraint errors
 * to appropriate HTTP status codes with structured JSON responses.
 * NEVER leaks internal stack traces to the client.
 */

import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../errors.js';

// PostgreSQL error codes
const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_NOT_NULL_VIOLATION = '23502';
const PG_CHECK_VIOLATION = '23514';

interface PgError extends Error {
  code?: string;
  detail?: string;
  constraint?: string;
}

export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const log = request.log;

  // ── Domain errors ────────────────────────────────────────────────────────
  if (error instanceof AppError) {
    log.warn({ event: 'app_error', code: error.code, message: error.message });
    const body: Record<string, unknown> = {
      error: error.message,
      code: error.code,
    };
    if ('details' in error && (error as { details?: unknown }).details !== undefined) {
      body['details'] = (error as { details?: unknown }).details;
    }
    reply.code(error.statusCode).send(body);
    return;
  }

  // ── Zod validation errors (thrown manually) ──────────────────────────────
  if (error instanceof ZodError) {
    log.debug({ event: 'zod_validation_error', issues: error.issues });
    reply.code(422).send({
      error: 'Validation error',
      code: 'VALIDATION_ERROR',
      details: error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
        code: i.code,
      })),
    });
    return;
  }

  // ── PostgreSQL constraint errors ─────────────────────────────────────────
  const pgErr = error as PgError;
  if (pgErr.code === PG_UNIQUE_VIOLATION) {
    log.warn({ event: 'pg_unique_violation', constraint: pgErr.constraint });
    reply.code(409).send({
      error: 'Resource already exists',
      code: 'CONFLICT',
      constraint: pgErr.constraint,
    });
    return;
  }

  if (pgErr.code === PG_FOREIGN_KEY_VIOLATION) {
    log.warn({ event: 'pg_fk_violation', constraint: pgErr.constraint });
    reply.code(422).send({
      error: 'Referenced resource does not exist',
      code: 'FOREIGN_KEY_VIOLATION',
      constraint: pgErr.constraint,
    });
    return;
  }

  if (pgErr.code === PG_NOT_NULL_VIOLATION || pgErr.code === PG_CHECK_VIOLATION) {
    log.warn({ event: 'pg_constraint_violation', code: pgErr.code });
    reply.code(422).send({
      error: 'Data constraint violation',
      code: 'CONSTRAINT_VIOLATION',
    });
    return;
  }

  // ── Fastify built-in validation errors (schema) ──────────────────────────
  const fastifyErr = error as FastifyError;
  if (fastifyErr.validation) {
    reply.code(400).send({
      error: 'Bad request',
      code: 'BAD_REQUEST',
      details: fastifyErr.validation,
    });
    return;
  }

  // ── Generic fallback — never leak internals ──────────────────────────────
  log.error({ event: 'unhandled_error', err: error });

  const status = fastifyErr.statusCode ?? 500;
  reply.code(status).send({
    error: status === 500 ? 'Internal server error' : (error.message || 'Internal server error'),
    code: 'INTERNAL_ERROR',
  });
}
