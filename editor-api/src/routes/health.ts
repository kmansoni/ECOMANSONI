/**
 * health.ts — GET /health — liveness probe endpoint.
 * No auth required. Used by Docker/Kubernetes health checks.
 */

import type { FastifyInstance } from 'fastify';
import { query } from '../db.js';

export async function healthRoute(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    try {
      await query('SELECT 1');
      return reply.code(200).send({
        status: 'ok',
        service: 'editor-api',
        timestamp: new Date().toISOString(),
        database: 'connected',
      });
    } catch {
      return reply.code(503).send({
        status: 'error',
        service: 'editor-api',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
      });
    }
  });
}
