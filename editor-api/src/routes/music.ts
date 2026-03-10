/**
 * music.ts — Music library search and listing.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authGuard } from '../middleware/auth-guard.js';
import { query } from '../db.js';
import { NotFoundError } from '../errors.js';
import type { MusicTrack } from '../types.js';

export async function musicRoute(app: FastifyInstance): Promise<void> {
  // GET /api/music — search with filters
  app.get('/api/music', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const q = request.query as Record<string, string>;
    const limit = Math.min(parseInt(q['limit'] ?? '20', 10), 100);
    const offset = parseInt(q['offset'] ?? '0', 10);
    const search = q['q'] ?? '';
    const genre = q['genre'];
    const mood = q['mood'];
    const bpmMin = q['bpm_min'] ? parseInt(q['bpm_min'], 10) : undefined;
    const bpmMax = q['bpm_max'] ? parseInt(q['bpm_max'], 10) : undefined;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (search) {
      conditions.push(`(title ILIKE $${idx} OR artist ILIKE $${idx})`);
      values.push(`%${search}%`);
      idx++;
    }
    if (genre) {
      conditions.push(`genre = $${idx++}`);
      values.push(genre);
    }
    if (mood) {
      conditions.push(`mood = $${idx++}`);
      values.push(mood);
    }
    if (bpmMin !== undefined) {
      conditions.push(`bpm >= $${idx++}`);
      values.push(bpmMin);
    }
    if (bpmMax !== undefined) {
      conditions.push(`bpm <= $${idx++}`);
      values.push(bpmMax);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [dataRes, countRes] = await Promise.all([
      query<MusicTrack>(
        `SELECT * FROM music_library ${where} ORDER BY title ASC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...values, limit, offset],
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM music_library ${where}`,
        values,
      ),
    ]);

    return reply.code(200).send({
      tracks: dataRes.rows,
      total: parseInt(countRes.rows[0]?.count ?? '0', 10),
      limit,
      offset,
    });
  });

  // GET /api/music/:id
  app.get('/api/music/:id', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const { id } = request.params as { id: string };
    const res = await query<MusicTrack>(
      'SELECT * FROM music_library WHERE id = $1',
      [id],
    );
    const track = res.rows[0];
    if (!track) throw new NotFoundError('MusicTrack', id);
    return reply.code(200).send({ track });
  });
}
