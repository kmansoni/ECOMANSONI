/**
 * render.ts — Render job management endpoints + SSE log streaming.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authGuard } from '../middleware/auth-guard.js';
import { CreateRenderJobSchema } from '../types.js';
import {
  createRenderJob,
  getRenderStatus,
  cancelRender,
  streamLogs,
} from '../services/render-service.js';
import { ValidationError } from '../errors.js';

export async function renderRoute(app: FastifyInstance): Promise<void> {
  // POST /api/projects/:projectId/render — create render job
  app.post('/api/projects/:projectId/render', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const { projectId } = request.params as { projectId: string };
    const parsed = CreateRenderJobSchema.safeParse(request.body ?? {});
    if (!parsed.success) throw new ValidationError('Invalid request body', parsed.error.issues);

    const job = await createRenderJob(projectId, request.user.userId, parsed.data);
    return reply.code(201).send({ job });
  });

  // GET /api/projects/:projectId/render/:jobId — job status
  app.get('/api/projects/:projectId/render/:jobId', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const { jobId } = request.params as { projectId: string; jobId: string };
    const job = await getRenderStatus(jobId, request.user.userId);
    return reply.code(200).send({ job });
  });

  // GET /api/projects/:projectId/render/:jobId/logs — SSE stream
  app.get('/api/projects/:projectId/render/:jobId/logs', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const { jobId } = request.params as { projectId: string; jobId: string };
    // streamLogs writes directly to reply.raw and manages connection lifecycle
    await streamLogs(jobId, request.user.userId, reply);
    // reply is hijacked — do not return anything
  });

  // POST /api/projects/:projectId/render/:jobId/cancel
  app.post('/api/projects/:projectId/render/:jobId/cancel', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const { jobId } = request.params as { projectId: string; jobId: string };
    const job = await cancelRender(jobId, request.user.userId);
    return reply.code(200).send({ job });
  });
}
