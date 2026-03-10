/**
 * assets.ts — User asset management.
 * Upload is handled by media-server; this registers uploaded assets to the DB.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authGuard } from '../middleware/auth-guard.js';
import { RegisterAssetSchema } from '../types.js';
import { registerAsset, listAssets, deleteAsset } from '../services/asset-service.js';
import { ValidationError } from '../errors.js';

export async function assetsRoute(app: FastifyInstance): Promise<void> {
  // POST /api/assets — register an already-uploaded asset
  app.post('/api/assets', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const parsed = RegisterAssetSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError('Invalid request body', parsed.error.issues);

    const asset = await registerAsset(request.user.userId, parsed.data);
    return reply.code(201).send({ asset });
  });

  // GET /api/assets — list user assets with optional filters
  app.get('/api/assets', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const q = request.query as Record<string, string>;
    const assets = await listAssets(request.user.userId, q['type'], q['project_id']);
    return reply.code(200).send({ assets });
  });

  // DELETE /api/assets/:id
  app.delete('/api/assets/:id', { preHandler: authGuard }, async (request: FastifyRequest, reply) => {
    const { id } = request.params as { id: string };
    await deleteAsset(id, request.user.userId);
    return reply.code(204).send();
  });
}
