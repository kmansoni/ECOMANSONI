/**
 * server.ts — Fastify application factory.
 *
 * Architecture decisions:
 *  - buildServer() exported as factory — allows isolated test instances.
 *  - CORS + Helmet registered globally.
 *  - Global error handler maps domain/Zod/pg errors to HTTP responses.
 *  - request.user is decorated (TypeScript sees it via module augmentation in types.ts).
 *  - 404 handler returns structured JSON.
 */

import Fastify, {
  type FastifyInstance,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { healthRoute } from './routes/health.js';
import { projectsRoute } from './routes/projects.js';
import { tracksRoute } from './routes/tracks.js';
import { clipsRoute } from './routes/clips.js';
import { effectsRoute } from './routes/effects.js';
import { keyframesRoute } from './routes/keyframes.js';
import { renderRoute } from './routes/render.js';
import { templatesRoute } from './routes/templates.js';
import { musicRoute } from './routes/music.js';
import { stickersRoute } from './routes/stickers.js';
import { assetsRoute } from './routes/assets.js';
import { errorHandler } from './middleware/error-handler.js';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
      transport:
        process.env['NODE_ENV'] !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    requestIdHeader: 'x-request-id',
    trustProxy: true,
  });

  // ── Plugins ────────────────────────────────────────────────────────────────

  await app.register(cors, {
    origin: process.env['CORS_ORIGIN'] ?? true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
  });

  await app.register(helmet, {
    // CSP not needed for JSON API
    contentSecurityPolicy: false,
  });

  // Decorate request with user placeholder — populated by authGuard
  app.decorateRequest('user', null);

  // ── Routes ─────────────────────────────────────────────────────────────────

  await app.register(healthRoute);
  await app.register(projectsRoute);
  await app.register(tracksRoute);
  await app.register(clipsRoute);
  await app.register(effectsRoute);
  await app.register(keyframesRoute);
  await app.register(renderRoute);
  await app.register(templatesRoute);
  await app.register(musicRoute);
  await app.register(stickersRoute);
  await app.register(assetsRoute);

  // ── Global error handler ───────────────────────────────────────────────────

  app.setErrorHandler(errorHandler);

  // ── 404 handler ────────────────────────────────────────────────────────────

  app.setNotFoundHandler((_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(404).send({ error: 'Not found', code: 'NOT_FOUND' });
  });

  return app;
}
