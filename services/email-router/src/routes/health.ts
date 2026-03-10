// routes/health.ts — Health, readiness probes & Prometheus metrics
//
// GET /health   — Liveness probe (always 200 if process is up)
// GET /ready    — Readiness probe (checks PostgreSQL, Redis, SMTP, queues)
// GET /metrics  — Prometheus metrics endpoint (prom-client registry)
//
// Readiness probe checks:
//   1. PostgreSQL: SELECT 1 with latency measurement
//   2. Redis: PING with latency measurement
//   3. SMTP: verifyConnection() + circuit breaker state
//   4. Queues: getQueueStats() (BullMQ connectivity)
//
// Returns JSON:
//   { status: 'ready' | 'not_ready', checks: {...}, uptime, timestamp }
//
// No auth required — but /metrics should be IP-restricted at
// reverse proxy level in production (nginx allowlist or k8s NetworkPolicy).

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { register as promRegister } from 'prom-client';
import { QueueService } from '../services/queueService.js';
import { SendService } from '../services/sendService.js';

export function createHealthRouter(deps: {
  db: Pool;
  redis: Redis;
  queueService: QueueService;
  sendService: SendService;
  startedAt: Date;
}): Router {
  const router = Router();
  const { db, redis, queueService, sendService, startedAt } = deps;

  // ─── GET /health — Liveness probe ─────────────────────
  // Lightweight check — if this returns, the process is alive.
  // K8s liveness probe / ELB health check target.
  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'email-router',
      uptime: Math.floor((Date.now() - startedAt.getTime()) / 1000),
      timestamp: new Date().toISOString(),
    });
  });

  // ─── GET /ready — Readiness probe ─────────────────────
  // Deep check — verifies all downstream dependencies are reachable.
  // Returns 503 if any critical dependency is down.
  // K8s will remove the pod from Service endpoints if not ready.
  router.get('/ready', async (_req: Request, res: Response) => {
    const checks: Record<string, { status: string; latencyMs?: number; error?: string }> = {};

    // PostgreSQL — SELECT 1 with latency
    try {
      const start = Date.now();
      await db.query('SELECT 1');
      checks.postgres = { status: 'ok', latencyMs: Date.now() - start };
    } catch (e: any) {
      checks.postgres = { status: 'error', error: e.message };
    }

    // Redis — PING with latency
    try {
      const start = Date.now();
      await redis.ping();
      checks.redis = { status: 'ok', latencyMs: Date.now() - start };
    } catch (e: any) {
      checks.redis = { status: 'error', error: e.message };
    }

    // SMTP — verify transport + circuit breaker state
    try {
      const smtpOk = await sendService.verifyConnection();
      const circuitState = await sendService.getCircuitState();
      checks.smtp = { status: smtpOk ? 'ok' : 'degraded', error: smtpOk ? undefined : 'SMTP connection failed' };
      checks.circuit_breaker = { status: circuitState === 'CLOSED' ? 'ok' : circuitState === 'HALF_OPEN' ? 'degraded' : 'error' };
    } catch (e: any) {
      checks.smtp = { status: 'error', error: e.message };
    }

    // Queues — BullMQ connectivity (getJobCounts on all queues)
    try {
      await queueService.getQueueStats();
      checks.queues = { status: 'ok' };
    } catch (e: any) {
      checks.queues = { status: 'error', error: e.message };
    }

    // Aggregate: ready if all checks are ok or degraded (degraded = functional but impaired)
    const allOk = Object.values(checks).every(c => c.status === 'ok' || c.status === 'degraded');
    const statusCode = allOk ? 200 : 503;

    res.status(statusCode).json({
      status: allOk ? 'ready' : 'not_ready',
      checks,
      uptime: Math.floor((Date.now() - startedAt.getTime()) / 1000),
      timestamp: new Date().toISOString(),
    });
  });

  // ─── GET /metrics — Prometheus metrics ─────────────────────
  // Exposes all registered prom-client metrics in Prometheus text format.
  // collectDefaultMetrics() is called during bootstrap (index.ts).
  router.get('/metrics', async (_req: Request, res: Response) => {
    try {
      res.set('Content-Type', promRegister.contentType);
      res.end(await promRegister.metrics());
    } catch (e: any) {
      res.status(500).end(e.message);
    }
  });

  return router;
}
