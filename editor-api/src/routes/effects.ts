/**
 * effects.ts — CRUD for clip effects.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authGuard } from '../middleware/auth-guard.js';
import { CreateEffectSchema, UpdateEffectSchema } from '../types.js';
import { query } from '../db.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../errors.js';
import type { EditorEffect } from '../types.js';

async function assertProjectOwnership(projectId: string, userId: string): Promise<void> {
  const res = await query<{ user_id: string }>(
    'SELECT user_id FROM editor_projects WHERE id = $1',
    [projectId],
  );
  const project = res.rows[0];
  if (!project) throw new NotFoundError('Project', projectId);
  if (project.user_id !== userId) throw new ForbiddenError();
}

export async function effectsRoute(app: FastifyInstance): Promise<void> {
  // POST /api/projects/:projectId/effects
  app.post('/api/projects/:projectId/effects', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const { projectId } = request.params as { projectId: string };
    await assertProjectOwnership(projectId, request.user.userId);

    const parsed = CreateEffectSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid request body', parsed.error.issues);

    // Verify clip belongs to this project
    const clipRes = await query<{ id: string }>(
      'SELECT id FROM editor_clips WHERE id = $1 AND project_id = $2',
      [parsed.data.clip_id, projectId],
    );
    if (!clipRes.rows[0]) throw new NotFoundError('Clip', parsed.data.clip_id);

    const res = await query<EditorEffect>(
      `INSERT INTO editor_effects (clip_id, project_id, type, name, params, sort_order, enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        parsed.data.clip_id,
        projectId,
        parsed.data.type,
        parsed.data.name,
        JSON.stringify(parsed.data.params ?? {}),
        parsed.data.sort_order ?? 0,
        parsed.data.enabled ?? true,
      ],
    );

    return reply.code(201).send({ effect: res.rows[0] });
  });

  // PUT /api/projects/:projectId/effects/:id
  app.put('/api/projects/:projectId/effects/:id', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };
    await assertProjectOwnership(projectId, request.user.userId);

    const existing = await query<EditorEffect>(
      'SELECT * FROM editor_effects WHERE id = $1 AND project_id = $2',
      [id, projectId],
    );
    if (!existing.rows[0]) throw new NotFoundError('Effect', id);

    const parsed = UpdateEffectSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid request body', parsed.error.issues);

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const fields = ['type', 'name', 'sort_order', 'enabled'] as const;
    for (const field of fields) {
      if (parsed.data[field] !== undefined) {
        setClauses.push(`${field} = $${idx++}`);
        values.push(parsed.data[field]);
      }
    }
    if (parsed.data.params !== undefined) {
      setClauses.push(`params = $${idx++}`);
      values.push(JSON.stringify(parsed.data.params));
    }

    if (setClauses.length === 0) return reply.code(200).send({ effect: existing.rows[0] });

    setClauses.push(`updated_at = NOW()`);
    values.push(id, projectId);

    const res = await query<EditorEffect>(
      `UPDATE editor_effects SET ${setClauses.join(', ')} WHERE id = $${idx} AND project_id = $${idx + 1} RETURNING *`,
      values,
    );
    return reply.code(200).send({ effect: res.rows[0] });
  });

  // DELETE /api/projects/:projectId/effects/:id
  app.delete('/api/projects/:projectId/effects/:id', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };
    await assertProjectOwnership(projectId, request.user.userId);

    const existing = await query<EditorEffect>(
      'SELECT id FROM editor_effects WHERE id = $1 AND project_id = $2',
      [id, projectId],
    );
    if (!existing.rows[0]) throw new NotFoundError('Effect', id);

    await query('DELETE FROM editor_effects WHERE id = $1', [id]);
    return reply.code(204).send();
  });
}
