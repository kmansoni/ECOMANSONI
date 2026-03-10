/**
 * keyframes.ts — Batch upsert and delete keyframes.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authGuard } from '../middleware/auth-guard.js';
import { BatchUpsertKeyframesSchema } from '../types.js';
import { query, transaction } from '../db.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../errors.js';
import type { EditorKeyframe } from '../types.js';

async function assertProjectOwnership(projectId: string, userId: string): Promise<void> {
  const res = await query<{ user_id: string }>(
    'SELECT user_id FROM editor_projects WHERE id = $1',
    [projectId],
  );
  const project = res.rows[0];
  if (!project) throw new NotFoundError('Project', projectId);
  if (project.user_id !== userId) throw new ForbiddenError();
}

export async function keyframesRoute(app: FastifyInstance): Promise<void> {
  // PUT /api/projects/:projectId/keyframes — batch upsert
  app.put('/api/projects/:projectId/keyframes', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const { projectId } = request.params as { projectId: string };
    await assertProjectOwnership(projectId, request.user.userId);

    const parsed = BatchUpsertKeyframesSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid request body', parsed.error.issues);

    const results = await transaction(async (client) => {
      const upserted: EditorKeyframe[] = [];

      for (const kf of parsed.data.keyframes) {
        // Verify clip belongs to this project
        const clipRes = await client.query<{ id: string }>(
          'SELECT id FROM editor_clips WHERE id = $1 AND project_id = $2',
          [kf.clip_id, projectId],
        );
        if (!clipRes.rows[0]) {
          throw new NotFoundError('Clip', kf.clip_id);
        }

        let row: EditorKeyframe;
        if (kf.id) {
          // Update existing keyframe
          const res = await client.query<EditorKeyframe>(
            `UPDATE editor_keyframes
             SET property=$2, time_ms=$3, value=$4, easing=$5, bezier_points=$6, updated_at=NOW()
             WHERE id=$1 AND project_id=$7
             RETURNING *`,
            [kf.id, kf.property, kf.time_ms, JSON.stringify(kf.value), kf.easing ?? 'linear',
             kf.bezier_points ? JSON.stringify(kf.bezier_points) : null, projectId],
          );
          if (!res.rows[0]) throw new NotFoundError('Keyframe', kf.id);
          row = res.rows[0];
        } else {
          // Insert new keyframe (upsert on clip_id + property + time_ms)
          const res = await client.query<EditorKeyframe>(
            `INSERT INTO editor_keyframes
               (clip_id, project_id, property, time_ms, value, easing, bezier_points)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (clip_id, property, time_ms)
             DO UPDATE SET value=EXCLUDED.value, easing=EXCLUDED.easing,
               bezier_points=EXCLUDED.bezier_points, updated_at=NOW()
             RETURNING *`,
            [kf.clip_id, projectId, kf.property, kf.time_ms, JSON.stringify(kf.value),
             kf.easing ?? 'linear', kf.bezier_points ? JSON.stringify(kf.bezier_points) : null],
          );
          row = res.rows[0]!;
        }
        upserted.push(row);
      }

      return upserted;
    });

    return reply.code(200).send({ keyframes: results });
  });

  // DELETE /api/projects/:projectId/keyframes/:id
  app.delete('/api/projects/:projectId/keyframes/:id', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const { projectId, id } = request.params as { projectId: string; id: string };
    await assertProjectOwnership(projectId, request.user.userId);

    const existing = await query<EditorKeyframe>(
      'SELECT id FROM editor_keyframes WHERE id = $1 AND project_id = $2',
      [id, projectId],
    );
    if (!existing.rows[0]) throw new NotFoundError('Keyframe', id);

    await query('DELETE FROM editor_keyframes WHERE id = $1', [id]);
    return reply.code(204).send();
  });
}
