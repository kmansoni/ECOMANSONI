/**
 * tracks.ts — CRUD for timeline tracks + reorder.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authGuard } from '../middleware/auth-guard.js';
import { CreateTrackSchema, UpdateTrackSchema, ReorderTracksSchema } from '../types.js';
import {
  createTrack,
  updateTrack,
  deleteTrack,
  reorderTracks,
} from '../services/timeline-service.js';
import { ValidationError } from '../errors.js';

export async function tracksRoute(app: FastifyInstance): Promise<void> {
  // POST /api/projects/:projectId/tracks
  app.post('/api/projects/:projectId/tracks', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const { projectId } = request.params as { projectId: string };
    const parsed = CreateTrackSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid request body', parsed.error.issues);

    const track = await createTrack(projectId, request.user.userId, parsed.data);
    return reply.code(201).send({ track });
  });

  // PUT /api/projects/:projectId/tracks/reorder
  // NOTE: must be registered before /:id to prevent route conflict
  app.put('/api/projects/:projectId/tracks/reorder', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const { projectId } = request.params as { projectId: string };
    const parsed = ReorderTracksSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid request body', parsed.error.issues);

    await reorderTracks(projectId, request.user.userId, parsed.data);
    return reply.code(200).send({ ok: true });
  });

  // PUT /api/projects/:projectId/tracks/:id
  app.put('/api/projects/:projectId/tracks/:id', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };
    const parsed = UpdateTrackSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid request body', parsed.error.issues);

    const track = await updateTrack(id, projectId, request.user.userId, parsed.data);
    return reply.code(200).send({ track });
  });

  // DELETE /api/projects/:projectId/tracks/:id
  app.delete('/api/projects/:projectId/tracks/:id', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };
    await deleteTrack(id, projectId, request.user.userId);
    return reply.code(204).send();
  });
}
