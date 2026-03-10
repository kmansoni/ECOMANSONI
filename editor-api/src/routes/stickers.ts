/**
 * stickers.ts — Sticker packs and items listing.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authGuard } from '../middleware/auth-guard.js';
import { query } from '../db.js';
import { NotFoundError } from '../errors.js';
import type { StickerPack, StickerItem } from '../types.js';

export async function stickersRoute(app: FastifyInstance): Promise<void> {
  // GET /api/stickers/packs
  app.get('/api/stickers/packs', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const q = request.query as Record<string, string>;
    const limit = Math.min(parseInt(q['limit'] ?? '50', 10), 200);
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
      query<StickerPack>(
        `SELECT * FROM sticker_packs ${where} ORDER BY name ASC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...values, limit, offset],
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM sticker_packs ${where}`,
        values,
      ),
    ]);

    return reply.code(200).send({
      packs: dataRes.rows,
      total: parseInt(countRes.rows[0]?.count ?? '0', 10),
    });
  });

  // GET /api/stickers/packs/:id — stickers in pack
  app.get('/api/stickers/packs/:id', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const { id } = request.params as { id: string };

    const packRes = await query<StickerPack>(
      'SELECT * FROM sticker_packs WHERE id = $1',
      [id],
    );
    const pack = packRes.rows[0];
    if (!pack) throw new NotFoundError('StickerPack', id);

    const itemsRes = await query<StickerItem>(
      'SELECT * FROM sticker_items WHERE pack_id = $1 ORDER BY name ASC',
      [id],
    );

    return reply.code(200).send({
      pack,
      items: itemsRes.rows,
    });
  });
}
