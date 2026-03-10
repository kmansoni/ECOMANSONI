/**
 * clips.ts — CRUD for clips + split + duplicate.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authGuard } from '../middleware/auth-guard.js';
import { CreateClipSchema, UpdateClipSchema, SplitClipSchema } from '../types.js';
import {
  createClip,
  listClips,
  updateClip,
  deleteClip,
  splitClip,
  duplicateClip,
} from '../services/timeline-service.js';
import { ValidationError } from '../errors.js';

export async function clipsRoute(app: FastifyInstance): Promise<void> {
  // POST /api/projects/:projectId/clips
  app.post('/api/projects/:projectId/clips', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const { projectId } = request.params as { projectId: string };
    const parsed = CreateClipSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid request body', parsed.error.issues);

    const clip = await createClip(projectId, request.user.userId, parsed.data);
    return reply.code(201).send({ clip });
  });

  // GET /api/projects/:projectId/clips
  app.get('/api/projects/:projectId/clips', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const { projectId } = request.params as { projectId: string };
    const clips = await listClips(projectId, request.user.userId);
    return reply.code(200).send({ clips });
  });

  // PUT /api/projects/:projectId/clips/:id
  app.put('/api/projects/:projectId/clips/:id', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };
    const parsed = UpdateClipSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid request body', parsed.error.issues);

    const clip = await updateClip(id, projectId, request.user.userId, parsed.data);
    return reply.code(200).send({ clip });
  });

  // DELETE /api/projects/:projectId/clips/:id
  app.delete('/api/projects/:projectId/clips/:id', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };
    await deleteClip(id, projectId, request.user.userId);
    return reply.code(204).send();
  });

  // POST /api/projects/:projectId/clips/:id/split
  app.post('/api/projects/:projectId/clips/:id/split', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };
    const parsed = SplitClipSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid request body', parsed.error.issues);

    const clips = await splitClip(id, projectId, request.user.userId, parsed.data.split_at_ms);
    return reply.code(200).send({ clips });
  });

  // POST /api/projects/:projectId/clips/:id/duplicate
  app.post('/api/projects/:projectId/clips/:id/duplicate', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };
    const clip = await duplicateClip(id, projectId, request.user.userId);
    return reply.code(201).send({ clip });
  });
}
