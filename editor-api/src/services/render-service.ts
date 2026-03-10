/**
 * render-service.ts — Render job management.
 *
 * Jobs are persisted to DB (render_jobs table) and enqueued in BullMQ.
 * SSE log streaming uses Redis pub/sub on channel `render:{jobId}:logs`.
 *
 * State machine:
 *   queued → processing → completed | failed | cancelled
 *
 * Attack vectors hardened:
 *  - Ownership verified before every operation.
 *  - Job cancellation checks status before attempting BullMQ removal.
 *  - SSE closes on client disconnect or job terminal state.
 */

import { logger } from '../logger.js';
import { Queue, Job } from 'bullmq';
import { Redis } from 'ioredis';
import type { FastifyReply } from 'fastify';
import { query } from '../db.js';
import { config } from '../config.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../errors.js';
import type { RenderJob, RenderJobLog } from '../types.js';
import { z } from 'zod';
import { CreateRenderJobSchema } from '../types.js';

export type CreateRenderJobInput = z.infer<typeof CreateRenderJobSchema>;

// ─── BullMQ / Redis singletons (module-level) ────────────────────────────
// BullMQ accepts a URL string for its connection option to avoid ioredis version conflicts.

const renderQueue = new Queue(config.render.queueName, {
  connection: { url: config.redis.url },
});

export async function closeConnections(): Promise<void> {
  await renderQueue.close();
}

// ─── Service functions ────────────────────────────────────────────────────

export async function createRenderJob(
  projectId: string,
  userId: string,
  input: CreateRenderJobInput,
): Promise<RenderJob> {
  // Verify ownership
  const projectRes = await query<{ user_id: string }>(
    'SELECT user_id FROM editor_projects WHERE id = $1',
    [projectId],
  );
  const project = projectRes.rows[0];
  if (!project) throw new NotFoundError('Project', projectId);
  if (project.user_id !== userId) throw new ForbiddenError();

  // Prevent duplicate active renders
  const activeRes = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM render_jobs
     WHERE project_id = $1 AND status IN ('queued','processing')`,
    [projectId],
  );
  if (parseInt(activeRes.rows[0]?.count ?? '0', 10) > 0) {
    throw new ConflictError('A render job for this project is already active');
  }

  // Persist to DB first — gives us the job ID
  const dbRes = await query<RenderJob>(
    `INSERT INTO render_jobs (project_id, user_id, status, settings)
     VALUES ($1, $2, 'queued', $3)
     RETURNING *`,
    [projectId, userId, JSON.stringify(input.settings ?? {})],
  );
  const job = dbRes.rows[0]!;

  // Enqueue in BullMQ
  await renderQueue.add(
    'render',
    { jobId: job.id, projectId, userId, settings: input.settings },
    { jobId: job.id },
  );

  logger.info({ event: 'render_job_created', jobId: job.id, projectId, userId });
  return job;
}

export async function getRenderStatus(jobId: string, userId: string): Promise<RenderJob> {
  const res = await query<RenderJob>(
    'SELECT * FROM render_jobs WHERE id = $1',
    [jobId],
  );
  const job = res.rows[0];
  if (!job) throw new NotFoundError('RenderJob', jobId);
  if (job.user_id !== userId) throw new ForbiddenError();
  return job;
}

export async function cancelRender(jobId: string, userId: string): Promise<RenderJob> {
  const existing = await getRenderStatus(jobId, userId); // includes ownership check

  if (existing.status === 'completed' || existing.status === 'failed') {
    throw new ConflictError(`Cannot cancel a job in status: ${existing.status}`);
  }

  if (existing.status === 'cancelled') {
    return existing;
  }

  // Attempt to remove from BullMQ queue (may already be processing)
  try {
    const bullJob = await Job.fromId(renderQueue, jobId);
    if (bullJob) {
      await bullJob.remove();
    }
  } catch {
    // Job may have already been picked up by worker — DB status update is canonical
    logger.warn({ event: 'render_cancel_bull_failed', jobId });
  }

  const res = await query<RenderJob>(
    `UPDATE render_jobs SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [jobId],
  );

  logger.info({ event: 'render_job_cancelled', jobId, userId });
  return res.rows[0]!;
}

/**
 * SSE log streaming via Redis pub/sub.
 *
 * Protocol:
 *  - Subscribe to channel `render:{jobId}:logs`
 *  - On each message: send `data: {json}\n\n`
 *  - Keep-alive: send `: ping\n\n` every 15s
 *  - Terminal events: close connection
 *  - Client disconnect: unsubscribe + cleanup
 */
export async function streamLogs(
  jobId: string,
  userId: string,
  reply: FastifyReply,
): Promise<void> {
  await getRenderStatus(jobId, userId); // ownership check

  // Fetch existing logs before subscribing (replay)
  const existingLogsRes = await query<RenderJobLog>(
    'SELECT * FROM render_job_logs WHERE job_id = $1 ORDER BY created_at ASC',
    [jobId],
  );

  const raw = reply.raw;
  raw.setHeader('Content-Type', 'text/event-stream');
  raw.setHeader('Cache-Control', 'no-cache');
  raw.setHeader('Connection', 'keep-alive');
  raw.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  raw.flushHeaders();

  // Replay historical logs
  for (const log of existingLogsRes.rows) {
    raw.write(`data: ${JSON.stringify(log)}\n\n`);
  }

  // Subscribe to live pub/sub
  const subscriber = new Redis(config.redis.url, { maxRetriesPerRequest: null });
  const channel = `render:${jobId}:logs`;

  let closed = false;

  const cleanup = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    clearInterval(keepAlive);
    await subscriber.unsubscribe(channel);
    await subscriber.quit();
    if (!raw.writableEnded) raw.end();
  };

  await subscriber.subscribe(channel);

  subscriber.on('message', (_ch: string, message: string) => {
    if (closed) return;
    raw.write(`data: ${message}\n\n`);

    // Check for terminal events embedded in message
    try {
      const parsed = JSON.parse(message) as { event?: string };
      if (parsed.event === 'job_completed' || parsed.event === 'job_failed') {
        void cleanup();
      }
    } catch {
      // Non-JSON message — ignore
    }
  });

  // Keep-alive ping every 15 seconds
  const keepAlive = setInterval(() => {
    if (closed) return;
    raw.write(': ping\n\n');
  }, 15_000);

  raw.on('close', () => void cleanup());
  raw.on('error', () => void cleanup());
}
