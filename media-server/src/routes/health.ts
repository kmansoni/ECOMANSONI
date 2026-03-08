/**
 * routes/health.ts — GET /health
 *
 * Probes MinIO connectivity and returns a structured status payload.
 * Used by Docker HEALTHCHECK and load balancers.
 *
 * Response shape:
 *  200 — { status: 'ok', minio: true, uptime: number }
 *  503 — { status: 'degraded', minio: false, uptime: number }
 *
 * Security note: No auth required — health endpoint must be accessible without credentials
 * so the orchestrator (Docker / Kubernetes) can probe it.
 * Ensure Nginx does NOT expose /health externally if internal-only probing is desired.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { checkMinioHealth } from '../storage.js';

export async function healthRoute(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    const minioOk = await checkMinioHealth();
    const uptime = process.uptime();

    if (minioOk) {
      return reply.code(200).send({
        status: 'ok',
        minio: true,
        uptime,
      });
    }

    app.log.warn({ event: 'health_check_degraded', minio: false });

    return reply.code(503).send({
      status: 'degraded',
      minio: false,
      uptime,
    });
  });
}
