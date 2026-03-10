/**
 * templates.ts — Template listing, detail, and apply (create project from template).
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authGuard } from '../middleware/auth-guard.js';
import { query, transaction } from '../db.js';
import { NotFoundError } from '../errors.js';
import type { EditorTemplate, EditorProject } from '../types.js';

export async function templatesRoute(app: FastifyInstance): Promise<void> {
  // GET /api/templates — list with pagination + category filter
  app.get('/api/templates', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const q = request.query as Record<string, string>;
    const limit = Math.min(parseInt(q['limit'] ?? '20', 10), 100);
    const offset = parseInt(q['offset'] ?? '0', 10);
    const category = q['category'];

    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (category) {
      conditions.push(`category = $${idx++}`);
      values.push(category);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [dataRes, countRes] = await Promise.all([
      query<EditorTemplate>(
        `SELECT id, title, description, category, tags, thumbnail_url, preview_url,
                aspect_ratio, duration_ms, is_premium, usage_count, created_at, updated_at
         FROM editor_templates ${where}
         ORDER BY usage_count DESC, created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...values, limit, offset],
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM editor_templates ${where}`,
        values,
      ),
    ]);

    return reply.code(200).send({
      templates: dataRes.rows,
      total: parseInt(countRes.rows[0]?.count ?? '0', 10),
      limit,
      offset,
    });
  });

  // GET /api/templates/:id
  app.get('/api/templates/:id', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const { id } = request.params as { id: string };
    const res = await query<EditorTemplate>(
      'SELECT * FROM editor_templates WHERE id = $1',
      [id],
    );
    const template = res.rows[0];
    if (!template) throw new NotFoundError('Template', id);
    return reply.code(200).send({ template });
  });

  // POST /api/templates/:id/apply — create project from template
  app.post('/api/templates/:id/apply', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.userId;

    const templateRes = await query<EditorTemplate>(
      'SELECT * FROM editor_templates WHERE id = $1',
      [id],
    );
    const template = templateRes.rows[0];
    if (!template) throw new NotFoundError('Template', id);

    const body = request.body as Record<string, unknown> | undefined ?? {};
    const title = (body['title'] as string | undefined) ?? `${template.title} (copy)`;

    const project = await transaction(async (client) => {
      // Create project from template metadata
      const projectRes = await client.query<EditorProject>(
        `INSERT INTO editor_projects
           (user_id, title, aspect_ratio, duration_ms, settings, thumbnail_url)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING *`,
        [
          userId,
          title,
          template.aspect_ratio,
          template.duration_ms,
          JSON.stringify(template.project_data ?? {}),
          template.thumbnail_url,
        ],
      );
      const project = projectRes.rows[0]!;

      // Increment usage_count
      await client.query(
        'UPDATE editor_templates SET usage_count = usage_count + 1 WHERE id = $1',
        [id],
      );

      return project;
    });

    return reply.code(201).send({ project });
  });
}
