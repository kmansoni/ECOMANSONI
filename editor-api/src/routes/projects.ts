/**
 * projects.ts — CRUD for editor projects + duplicate.
 *
 * All routes protected by authGuard preHandler.
 * Responses follow RFC 7807 error shape via global error handler.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { authGuard } from '../middleware/auth-guard.js';
import {
  CreateProjectSchema,
  UpdateProjectSchema,
} from '../types.js';
import {
  createProject,
  getProjectTree,
  listProjects,
  updateProject,
  deleteProject,
  duplicateProject,
} from '../services/project-service.js';
import { ValidationError } from '../errors.js';

export async function projectsRoute(app: FastifyInstance): Promise<void> {
  // POST /api/projects — create project
  app.post('/api/projects', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const parsed = CreateProjectSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid request body', parsed.error.issues);

    const project = await createProject(request.user.userId, parsed.data);
    return reply.code(201).send({ project });
  });

  // GET /api/projects — list projects
  app.get('/api/projects', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const q = request.query as Record<string, string>;
    const result = await listProjects(request.user.userId, {
      limit: q['limit'] ? parseInt(q['limit'], 10) : 20,
      offset: q['offset'] ? parseInt(q['offset'], 10) : 0,
      sort: (q['sort'] as 'created_at' | 'updated_at' | 'title') ?? 'updated_at',
      order: (q['order'] as 'asc' | 'desc') ?? 'desc',
    });
    return reply.code(200).send(result);
  });

  // GET /api/projects/:id — full project tree
  app.get('/api/projects/:id', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const { id } = request.params as { id: string };
    const tree = await getProjectTree(id, request.user.userId);
    return reply.code(200).send(tree);
  });

  // PUT /api/projects/:id — partial update
  app.put('/api/projects/:id', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateProjectSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid request body', parsed.error.issues);

    const project = await updateProject(id, request.user.userId, parsed.data);
    return reply.code(200).send({ project });
  });

  // DELETE /api/projects/:id
  app.delete('/api/projects/:id', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const { id } = request.params as { id: string };
    await deleteProject(id, request.user.userId);
    return reply.code(204).send();
  });

  // POST /api/projects/:id/duplicate
  app.post('/api/projects/:id/duplicate', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const { id } = request.params as { id: string };
    const project = await duplicateProject(id, request.user.userId);
    return reply.code(201).send({ project });
  });
}
