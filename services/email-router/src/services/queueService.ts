// services/queueService.ts — BullMQ job queue management
//
// Queues:
//   email:send       — Primary send queue (priority-based)
//   email:retry      — Delayed retry queue (exponential backoff)
//   email:bounce     — Bounce/complaint processing queue
//   email:batch      — Batch send decomposition queue
//
// Architecture:
//   - Producers: HTTP route handlers enqueue jobs
//   - Consumers: BullMQ workers process jobs (one worker per queue)
//   - Concurrency: configurable per queue (send=10, retry=5, bounce=3, batch=2)
//   - Backpressure: if queue depth > threshold, return 429 to API
//
// Reliability:
//   - Jobs are persistent in Redis (AOF enabled)
//   - Failed jobs: moved to failed set, emitted as 'failed' event
//   - Stalled jobs: detected after 30s, re-queued automatically
//   - Completed jobs: removed by count (configurable per queue)
//
// Monitoring:
//   - Queue depth exposed via getQueueStats() for /metrics + /health
//   - Failed job counter by error type (worker 'failed' event)

import { Queue, Worker, Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import { getLogger } from '../lib/logger.js';
import type { SendEmailJob, BounceProcessJob } from '../types/index.js';

// ─── Connection config type for BullMQ ─────────────────────
interface BullMQConnection {
  host: string;
  port: number;
  password?: string;
  db?: number;
  maxRetriesPerRequest: null; // Required by BullMQ workers
}

export class QueueService {
  private sendQueue: Queue;
  private retryQueue: Queue;
  private bounceQueue: Queue;
  private batchQueue: Queue;

  private sendWorker: Worker | null = null;
  private retryWorker: Worker | null = null;
  private bounceWorker: Worker | null = null;
  private batchWorker: Worker | null = null;

  private readonly connection: BullMQConnection;
  private shutdownInProgress = false;

  constructor(
    redis: Redis,    // источник connection options (DI контракт)
    _db: Pool,
  ) {
    // ── Почему НЕ env.REDIS_URL и НЕ прямая передача ioredis instance ──────────
    //
    // 1. НЕЛЬЗЯ использовать env.REDIS_URL напрямую:
    //    Caller передал Redis instance с конкретными настройками (TLS, password,
    //    db index, timeout). Повторный парсинг URL создаёт второй источник истины —
    //    они могут расходиться (env vs runtime settings). Извлекаем из redis.options.
    //
    // 2. НЕЛЬЗЯ передать ioredis instance в BullMQ Queue/Worker напрямую:
    //    BullMQ бандлит СОБСТВЕННЫЙ ioredis (другая minor-версия). TypeScript
    //    выдаёт StructuralTypeError из-за internal protected member mismatch
    //    (AbstractConnector.connecting). Поэтому передаём ConnectionOptions object —
    //    BullMQ создаёт свой ioredis instance с теми же параметрами.
    //
    // 3. maxRetriesPerRequest: null ОБЯЗАТЕЛЕН для BullMQ Worker:
    //    Workers используют блокирующие Redis-команды (BRPOP, XREAD). ioredis
    //    бросает исключение на blocking commands ohne maxRetriesPerRequest: null.
    //    Queue (producer) объекты этого не требуют, но мы используем один
    //    this.connection для обоих — с null безопасно для producer'ов тоже.
    this.connection = {
      host: redis.options.host ?? '127.0.0.1',
      port: redis.options.port ?? 6379,
      password: redis.options.password as string | undefined,
      db: typeof redis.options.db === 'number' ? redis.options.db : 0,
      maxRetriesPerRequest: null, // required for BullMQ Worker blocking commands
    };

    // Queues — producer side.
    // defaultJobOptions apply to all jobs unless overridden per-add.
    this.sendQueue = new Queue('email:send', {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 1, // We manage retries ourselves via retryQueue
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });

    this.retryQueue = new Queue('email:retry', {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });

    this.bounceQueue = new Queue('email:bounce', {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3, // Bounce processing can be retried by BullMQ itself
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 1000 },
      },
    });

    this.batchQueue = new Queue('email:batch', {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 10000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    });
  }

  // ─── Producer methods ─────────────────────

  /**
   * Добавить задачу на отправку одного email.
   * jobId = messageId → BullMQ дедупликация; повторный add с тем же
   * messageId вернёт существующий job без создания дубликата.
   */
  async addSendJob(job: SendEmailJob): Promise<string> {
    const added = await this.sendQueue.add('send', job, {
      jobId: job.messageId, // Idempotent by messageId
      priority: job.priority,
    });
    return added.id!;
  }

  /**
   * Добавить задачу на retry с exponential backoff.
   * jobId содержит attempt number → каждая попытка уникальна.
   */
  async addRetryJob(job: SendEmailJob, delayMs: number): Promise<string> {
    const added = await this.retryQueue.add('retry', job, {
      jobId: `${job.messageId}:retry:${job.attempt}`,
      delay: delayMs,
      priority: job.priority,
    });
    return added.id!;
  }

  /**
   * Добавить bounce на обработку.
   * Нет дедупликации по jobId — bounces могут быть из разных источников.
   */
  async addBounceJob(job: BounceProcessJob): Promise<string> {
    const added = await this.bounceQueue.add('bounce', job);
    return added.id!;
  }

  /**
   * Добавить batch (массовая отправка).
   * jobId = batchId → дедупликация на уровне batch.
   */
  async addBatchJob(messages: SendEmailJob[], batchId: string): Promise<string> {
    const added = await this.batchQueue.add(
      'batch',
      { messages, batchId },
      { jobId: batchId },
    );
    return added.id!;
  }

  // ─── Consumer methods ─────────────────────

  /**
   * Запуск workers. Вызывается один раз при старте приложения.
   * Handlers передаются из sendService и bounceProcessor — избегаем
   * circular dependency через dependency injection.
   */
  startWorkers(handlers: {
    onSend: (job: Job<SendEmailJob>) => Promise<void>;
    onBounce: (job: Job<BounceProcessJob>) => Promise<void>;
    onBatch: (job: Job<{ messages: SendEmailJob[]; batchId: string }>) => Promise<void>;
  }): void {
    const logger = getLogger();

    if (this.sendWorker) {
      logger.warn('Queue workers already started — ignoring duplicate startWorkers() call');
      return;
    }

    // ── Send worker: concurrency 10, rate-limited to 50 emails/sec ──
    this.sendWorker = new Worker(
      'email:send',
      async (job) => {
        await handlers.onSend(job as Job<SendEmailJob>);
      },
      {
        connection: this.connection,
        concurrency: 10,
        limiter: { max: 50, duration: 1000 },
        stalledInterval: 30_000, // Stall detection every 30s
        lockDuration: 60_000,   // Job lock 60s (SMTP can be slow)
      },
    );

    // ── Retry worker: lower concurrency, same handler ──
    this.retryWorker = new Worker(
      'email:retry',
      async (job) => {
        await handlers.onSend(job as Job<SendEmailJob>);
      },
      {
        connection: this.connection,
        concurrency: 5,
        stalledInterval: 30_000,
        lockDuration: 60_000,
      },
    );

    // ── Bounce worker ──
    this.bounceWorker = new Worker(
      'email:bounce',
      async (job) => {
        await handlers.onBounce(job as Job<BounceProcessJob>);
      },
      {
        connection: this.connection,
        concurrency: 3,
        stalledInterval: 15_000,
        lockDuration: 30_000,
      },
    );

    // ── Batch worker: splits batch → individual send jobs ──
    this.batchWorker = new Worker(
      'email:batch',
      async (job) => {
        await handlers.onBatch(
          job as Job<{ messages: SendEmailJob[]; batchId: string }>,
        );
      },
      {
        connection: this.connection,
        concurrency: 2,
        stalledInterval: 60_000,
        lockDuration: 300_000, // Large batches may take 5 min
      },
    );

    // ── Error handlers for all workers ──
    const workers: Record<string, Worker> = {
      send: this.sendWorker,
      retry: this.retryWorker,
      bounce: this.bounceWorker,
      batch: this.batchWorker,
    };

    for (const [name, worker] of Object.entries(workers)) {
      worker.on('failed', (job, err) => {
        logger.error(
          { queue: name, jobId: job?.id, err: err.message, stack: err.stack },
          `Queue job failed [${name}]`,
        );
      });

      worker.on('error', (err) => {
        logger.error({ queue: name, err: err.message }, `Worker error [${name}]`);
      });

      worker.on('stalled', (jobId) => {
        logger.warn({ queue: name, jobId }, `Job stalled [${name}]`);
      });
    }

    logger.info('Queue workers started (send=10, retry=5, bounce=3, batch=2)');
  }

  // ─── Observability ─────────────────────

  /**
   * Получить статистику всех очередей (для /health endpoint и Prometheus).
   */
  async getQueueStats(): Promise<
    Record<string, { waiting: number; active: number; completed: number; failed: number; delayed: number }>
  > {
    const queues: Record<string, Queue> = {
      send: this.sendQueue,
      retry: this.retryQueue,
      bounce: this.bounceQueue,
      batch: this.batchQueue,
    };

    const stats: Record<string, { waiting: number; active: number; completed: number; failed: number; delayed: number }> = {};

    for (const [name, queue] of Object.entries(queues)) {
      const counts = await queue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
      );
      stats[name] = {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
      };
    }

    return stats;
  }

  /**
   * Проверка backpressure: если waiting > threshold → вернуть true
   * (вызывающий код должен ответить 429 Too Many Requests).
   */
  async isBackpressured(threshold: number = 10_000): Promise<boolean> {
    const counts = await this.sendQueue.getJobCounts('waiting', 'delayed');
    return ((counts.waiting ?? 0) + (counts.delayed ?? 0)) > threshold;
  }

  // ─── DLQ (Dead Letter Queue) management ─────────────────────

  /**
   * Получить failed jobs из указанной очереди (для admin dashboard / DLQ replay).
   */
  async getFailedJobs(queueName: string, start: number = 0, end: number = 100): Promise<Job[]> {
    const queue = this.resolveQueue(queueName);
    return queue.getFailed(start, end);
  }

  /**
   * Replay (retry) failed job из DLQ.
   */
  async replayFailedJob(queueName: string, jobId: string): Promise<void> {
    const queue = this.resolveQueue(queueName);
    const job = await queue.getJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId} in queue ${queueName}`);
    }
    await job.retry();
  }

  /**
   * Очистить все failed jobs из очереди.
   */
  async drainFailedJobs(queueName: string): Promise<number> {
    const queue = this.resolveQueue(queueName);
    const failed = await queue.getFailed(0, -1);
    let removed = 0;
    for (const job of failed) {
      await job.remove();
      removed++;
    }
    return removed;
  }

  // ─── Internal ─────────────────────

  private resolveQueue(name: string): Queue {
    const map: Record<string, Queue> = {
      send: this.sendQueue,
      retry: this.retryQueue,
      bounce: this.bounceQueue,
      batch: this.batchQueue,
    };
    const queue = map[name];
    if (!queue) {
      throw new Error(`Unknown queue: ${name}. Valid names: ${Object.keys(map).join(', ')}`);
    }
    return queue;
  }

  // ─── Graceful shutdown ─────────────────────

  /**
   * Graceful shutdown: закрывает workers (drain текущих jobs),
   * затем закрывает producers.
   */
  async shutdown(): Promise<void> {
    if (this.shutdownInProgress) return;
    this.shutdownInProgress = true;

    const logger = getLogger();
    logger.info('Shutting down queue workers...');

    // Закрываем workers первыми (drain текущих job'ов)
    const workerClosePromises: Promise<void>[] = [];
    if (this.sendWorker) workerClosePromises.push(this.sendWorker.close());
    if (this.retryWorker) workerClosePromises.push(this.retryWorker.close());
    if (this.bounceWorker) workerClosePromises.push(this.bounceWorker.close());
    if (this.batchWorker) workerClosePromises.push(this.batchWorker.close());

    await Promise.allSettled(workerClosePromises);
    logger.info('Queue workers closed');

    // Закрываем producers
    await Promise.allSettled([
      this.sendQueue.close(),
      this.retryQueue.close(),
      this.bounceQueue.close(),
      this.batchQueue.close(),
    ]);

    logger.info('Queue producers closed — shutdown complete');
  }
}
