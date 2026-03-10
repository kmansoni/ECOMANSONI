// index.ts — @mansoni/email-router entry point
//
// Bootstrap sequence:
//   1. Validate environment (Zod schema, fail-fast)
//   2. Initialize Pino logger
//   3. Connect PostgreSQL pool (verify with SELECT 1)
//   4. Connect Redis (verify with PING)
//   5. Initialize services (DI — all services receive deps via constructor)
//   6. Start BullMQ workers (send, retry, bounce, batch)
//   7. Register Prometheus default metrics
//   8. Build Express app (middleware → routes → error handlers)
//   9. Listen on configured port
//  10. Register graceful shutdown handlers (SIGTERM, SIGINT)
//
// Graceful shutdown order:
//   1. Stop accepting new HTTP connections
//   2. Drain BullMQ workers (finish in-flight jobs)
//   3. Close SMTP pool (SendService.shutdown)
//   4. Close PostgreSQL pool
//   5. Disconnect Redis
//   6. Exit 0
//   7. Force exit after 30s if drain hangs
//
// Zero-trust: no secrets in code, all from env.
// Stateless API nodes: horizontal scaling behind load balancer.

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { collectDefaultMetrics } from 'prom-client';

import { loadEnv } from './config/env.js';
import { createLogger, createRequestLogger } from './lib/logger.js';
import { createIPRateLimit, TenantRateLimiter } from './lib/rateLimit.js';
import { IdempotencyService } from './lib/idempotency.js';
import { QueueService } from './services/queueService.js';
import { TemplateService } from './services/templateService.js';
import { SendService } from './services/sendService.js';
import { SuppressionService } from './services/suppressionService.js';
import { BounceProcessor } from './services/bounceProcessor.js';
import { createEmailRouter } from './routes/email.js';
import { createHealthRouter } from './routes/health.js';

async function main(): Promise<void> {
  // ─── 1. Load environment & logger ─────────────────────
  const env = loadEnv();
  const logger = createLogger();
  logger.info({ env: env.NODE_ENV, port: env.PORT }, 'Starting email-router...');

  // ─── 2. Initialize PostgreSQL ─────────────────────
  // Pool with configurable min/max connections.
  // min > 0 keeps warm connections for p99 latency.
  const db = new Pool({
    connectionString: env.DATABASE_URL,
    min: env.DATABASE_POOL_MIN,
    max: env.DATABASE_POOL_MAX,
  });
  // Verify connection at startup — fail fast if DB is unreachable
  await db.query('SELECT 1');
  logger.info('PostgreSQL connected');

  // ─── 3. Initialize Redis ─────────────────────
  // maxRetriesPerRequest: null is REQUIRED for BullMQ workers
  // (BullMQ does its own retry logic, ioredis default of 20 would throw).
  const redis = new Redis(env.REDIS_URL, {
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy: (times: number) => Math.min(times * 100, 5000),
  });
  await redis.ping();
  logger.info('Redis connected');

  // ─── 4. Initialize services (dependency injection) ─────────────────────
  const idempotencyService = new IdempotencyService(db, redis);
  const tenantRateLimiter = new TenantRateLimiter(redis);
  const queueService = new QueueService(redis, db);
  const templateService = new TemplateService(db, redis);
  const suppressionService = new SuppressionService(db, redis);
  const sendService = new SendService(db, redis, queueService);
  const bounceProcessor = new BounceProcessor(db, suppressionService);

  // ─── 5. Start queue workers ─────────────────────
  // Handlers are injected to avoid circular dependency
  // (queueService ↔ sendService would cause import cycle).
  queueService.startWorkers({
    onSend: async (job) => {
      await sendService.processSendJob(job.data);
    },
    onBounce: async (job) => {
      await bounceProcessor.processBounce(job.data);
    },
    onBatch: async (job) => {
      // Batch worker: decompose batch into individual send jobs
      const { messages } = job.data;
      for (const msg of messages) {
        await queueService.addSendJob(msg);
      }
    },
  });

  // ─── 6. Prometheus default metrics ─────────────────────
  // prefix ensures no conflicts with other services in the same registry
  collectDefaultMetrics({ prefix: 'email_router_' });

  // ─── 7. Express app setup ─────────────────────
  const app = express();
  const startedAt = new Date();

  // ─── Global middleware ─────────────────────
  // helmet: security headers (X-Frame-Options, CSP, etc.)
  app.use(helmet());
  // CORS: restrict to configured origins
  app.use(cors({
    origin: env.CORS_ORIGINS.split(',').map(s => s.trim()),
    credentials: true,
  }));
  // JSON body parser with 10MB limit (for attachments in base64)
  app.use(express.json({ limit: '10mb' }));
  // IP-based rate limit: 120 req/min per IP (anti-DDoS layer)
  app.use(createIPRateLimit());

  // ─── Request context middleware ─────────────────────
  // Assigns requestId + child logger to every incoming request.
  // X-Request-Id header propagation for distributed tracing.
  app.use((req: any, res, next) => {
    req.requestId = req.headers['x-request-id'] as string || randomUUID();
    req.log = createRequestLogger({ requestId: req.requestId });
    res.setHeader('X-Request-Id', req.requestId);
    next();
  });

  // ─── Request logging ─────────────────────
  // Logs method, url, statusCode, durationMs on response finish.
  // PII redaction handled by logger configuration (email addresses, auth headers).
  app.use((req: any, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      req.log.info({
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: duration,
        userAgent: req.headers['user-agent'],
      }, 'request completed');
    });
    next();
  });

  // ─── Routes ─────────────────────
  // Health/ready/metrics — no auth, no prefix
  const healthRouter = createHealthRouter({ db, redis, queueService, sendService, startedAt });
  app.use('/', healthRouter);

  // Email API — JWT-protected, mounted under /email
  const emailRouter = createEmailRouter({
    db, queueService, templateService, suppressionService,
    bounceProcessor, idempotencyService, tenantRateLimiter,
  });
  app.use('/email', emailRouter);

  // ─── 404 handler ─────────────────────
  app.use((req: any, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: `Route not found: ${req.method} ${req.path}` },
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  });

  // ─── Global error handler ─────────────────────
  // Catches unhandled errors from route handlers.
  // In production: generic message (no stack trace leak).
  // In dev: error message exposed for debugging.
  app.use((err: Error, req: any, res: any, _next: any) => {
    req.log?.error({ err }, 'Unhandled error');
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: env.NODE_ENV === 'production' ? 'Internal server error' : err.message },
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  });

  // ─── 8. Start server ─────────────────────
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, '🚀 Email-router is running');
  });

  // ─── 9. Graceful shutdown ─────────────────────
  // Order matters: stop HTTP → drain workers → close SMTP → close DB → close Redis.
  // Force exit after 30s to prevent zombie processes.
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');

    server.close(async () => {
      logger.info('HTTP server closed');
      try {
        await queueService.shutdown();
      } catch (err) {
        logger.error({ err }, 'Error shutting down queue workers');
      }
      try {
        await sendService.shutdown();
      } catch (err) {
        logger.error({ err }, 'Error shutting down send service');
      }
      try {
        await db.end();
      } catch (err) {
        logger.error({ err }, 'Error closing PostgreSQL pool');
      }
      try {
        redis.disconnect();
      } catch (err) {
        logger.error({ err }, 'Error disconnecting Redis');
      }
      logger.info('All connections closed. Goodbye!');
      process.exit(0);
    });

    // Force exit after 30s — handles cases where worker drain hangs
    // (e.g., stuck SMTP connection, Redis unreachable)
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // ─── Unhandled rejection / exception ─────────────────────
  // Log and crash on uncaught exceptions (process manager will restart).
  // Unhandled rejections are logged but don't crash (may be transient).
  process.on('unhandledRejection', (reason, _promise) => {
    logger.fatal({ reason }, 'Unhandled rejection');
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    process.exit(1);
  });
}

main().catch((error) => {
  console.error('Failed to start email-router:', error);
  process.exit(1);
});
