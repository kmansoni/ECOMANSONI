/**
 * index.ts — Entry point for the Render Worker process.
 *
 * This file is meant to be run as a standalone Node.js process:
 *   node dist/worker/index.js
 *
 * Architecture:
 *  - Connects to Redis (BullMQ) and PostgreSQL (job state + log persistence).
 *  - Creates a BullMQ Worker that listens on the 'editor-render' queue.
 *  - Handles graceful shutdown on SIGINT/SIGTERM:
 *    1. Stops accepting new jobs.
 *    2. Waits for the current job to complete (or timeout after 30s).
 *    3. Closes Redis and PostgreSQL connections.
 *    4. Exits with code 0.
 *
 * Concurrency:
 *  - Default concurrency = 1 (one render job at a time per worker instance).
 *  - For horizontal scaling: deploy multiple worker pods/containers.
 *  - Each job is CPU-intensive (FFmpeg) — more than 1 concurrent job per
 *    pod risks OOM and CPU starvation.
 *
 * Monitoring:
 *  - Process health is logged at startup and shutdown.
 *  - BullMQ events (completed, failed, stalled) are logged.
 *  - The worker relies on BullMQ's built-in stalled-job detection
 *    (lockDuration + stalledInterval) to handle crashed workers.
 *
 * Environment variables (required):
 *  - DATABASE_URL — PostgreSQL connection string
 *  - REDIS_URL — Redis connection URL
 *  - JWT_SECRET — (inherited from config, required by config.ts)
 *  - MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY — S3-compatible storage
 *
 * Optional:
 *  - RENDER_CONCURRENCY — number of concurrent jobs (default: 1)
 *  - RENDER_LOCK_DURATION — BullMQ lock duration in ms (default: 600000 = 10min)
 *  - RENDER_TEMP_DIR — base temp directory (default: /tmp/editor-render)
 *  - LOG_LEVEL — debug | info | warn | error (default: info)
 */

import { Worker } from 'bullmq';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { gracefulShutdown as dbShutdown } from '../db.js';
import { handleRenderJob, closePublisher, type RenderJobData } from './render-worker.js';

// ── Configuration ───────────────────────────────────────────────────────────

const CONCURRENCY = parseInt(process.env['RENDER_CONCURRENCY'] ?? '1', 10);
const LOCK_DURATION = parseInt(process.env['RENDER_LOCK_DURATION'] ?? '600000', 10);
const STALLED_INTERVAL = 30_000; // 30 seconds

// ── Worker Setup ────────────────────────────────────────────────────────────

logger.info({
  event: 'worker_starting',
  queue: config.render.queueName,
  concurrency: CONCURRENCY,
  lockDuration: LOCK_DURATION,
  pid: process.pid,
  nodeVersion: process.version,
});

const worker = new Worker<RenderJobData>(
  config.render.queueName,
  handleRenderJob,
  {
    connection: { url: config.redis.url },
    concurrency: CONCURRENCY,
    lockDuration: LOCK_DURATION,
    stalledInterval: STALLED_INTERVAL,
    // Remove completed/failed jobs from Redis after 24h/7d
    removeOnComplete: { age: 86400, count: 1000 },
    removeOnFail: { age: 604800, count: 5000 },
  },
);

// ── Worker Event Listeners ──────────────────────────────────────────────────

worker.on('completed', (job) => {
  logger.info({
    event: 'worker_job_completed',
    jobId: job?.id,
    jobName: job?.name,
  });
});

worker.on('failed', (job, err) => {
  logger.error({
    event: 'worker_job_failed',
    jobId: job?.id,
    jobName: job?.name,
    err: err.message,
  });
});

worker.on('stalled', (jobId) => {
  logger.warn({
    event: 'worker_job_stalled',
    jobId,
  });
});

worker.on('error', (err) => {
  logger.error({
    event: 'worker_error',
    err: err.message,
  });
});

worker.on('active', (job) => {
  logger.info({
    event: 'worker_job_active',
    jobId: job.id,
    jobName: job.name,
    data: {
      projectId: job.data.projectId,
      userId: job.data.userId,
    },
  });
});

logger.info({
  event: 'worker_started',
  queue: config.render.queueName,
  pid: process.pid,
});

// ── Graceful Shutdown ───────────────────────────────────────────────────────

let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({
    event: 'worker_shutdown_start',
    signal,
    pid: process.pid,
  });

  try {
    // 1. Stop accepting new jobs. Wait for current job to finish (30s max).
    await worker.close(true);
    logger.info({ event: 'worker_closed' });

    // 2. Close Redis pub/sub publisher
    await closePublisher();
    logger.info({ event: 'redis_publisher_closed' });

    // 3. Drain PostgreSQL pool
    await dbShutdown();
    logger.info({ event: 'db_pool_closed' });

    logger.info({
      event: 'worker_shutdown_complete',
      signal,
    });

    process.exit(0);
  } catch (err) {
    logger.error({
      event: 'worker_shutdown_error',
      err: (err as Error).message,
    });
    process.exit(1);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

// Handle uncaught errors to prevent silent crashes
process.on('uncaughtException', (err) => {
  logger.error({
    event: 'uncaught_exception',
    err: err.message,
    stack: err.stack,
  });
  void shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error({
    event: 'unhandled_rejection',
    err: String(reason),
  });
  // Don't exit on unhandled rejection — the worker can recover
});
