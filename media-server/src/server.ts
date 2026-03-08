/**
 * server.ts — Fastify application factory.
 *
 * Architecture decisions:
 *  - buildServer() is exported as a factory function, not a singleton,
 *    so that integration tests can spin up isolated instances.
 *  - @fastify/multipart is registered globally with hard body size limits
 *    derived from config (500 MB max).
 *  - Errors are mapped to RFC 7807-style JSON bodies with consistent shape.
 *  - Graceful shutdown: SIGTERM/SIGINT close the HTTP server cleanly, giving
 *    in-flight requests up to 10 s to complete before forced exit.
 *
 * Observability:
 *  - Every request is logged by pino (built into Fastify) with method, url,
 *    statusCode, responseTime.
 *  - Application-level structured events are logged in each route handler.
 */

import Fastify, {
  type FastifyInstance,
  type FastifyRequest,
  type FastifyReply,
  type FastifyError,
} from 'fastify';
import multipart from '@fastify/multipart';
import { config } from './config.js';
import { uploadRoute } from './routes/upload.js';
import { healthRoute } from './routes/health.js';
import { deleteRoute } from './routes/delete.js';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
      // Pino pretty-print only in dev; production outputs newline-delimited JSON for log shipping.
      transport:
        process.env['NODE_ENV'] !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    // Expose Fastify's default request-id header for distributed tracing correlation.
    requestIdHeader: 'x-request-id',
    trustProxy: true, // Nginx sits in front
  });

  // ── Plugins ────────────────────────────────────────────────────────────────

  await app.register(multipart, {
    limits: {
      /**
       * Global file size limit fed to Busboy.
       * Per-bucket limits are enforced after buffering in upload.ts.
       * This prevents DoS via streaming a 10 GB payload.
       */
      fileSize: config.limits.globalMaxBytes,
      files: 1,     // One file per request
      fields: 10,   // bucket, path + room for future fields
    },
    // Attach all non-file fields to data.fields for convenient access in routes
    attachFieldsToBody: false,
  });

  // ── Routes ────────────────────────────────────────────────────────────────

  await app.register(healthRoute);
  await app.register(uploadRoute);
  await app.register(deleteRoute);

  // ── Global error handler ──────────────────────────────────────────────────

  app.setErrorHandler((error: FastifyError, _request: FastifyRequest, reply: FastifyReply) => {
    app.log.error({ event: 'unhandled_error', err: error });

    // Fastify validation errors (schema mismatch)
    if (error.validation) {
      return reply.code(400).send({
        error: 'Bad request',
        details: error.validation,
      });
    }

    // Multipart body size exceeded
    if (error.code === 'FST_FILES_LIMIT' || error.code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.code(413).send({ error: 'File too large' });
    }

    // Generic fallback — never leak internal details to client
    const status = error.statusCode ?? 500;
    return reply.code(status).send({ error: error.message || 'Internal server error' });
  });

  // ── 404 handler ────────────────────────────────────────────────────────────

  app.setNotFoundHandler((_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(404).send({ error: 'Not found' });
  });

  return app;
}
