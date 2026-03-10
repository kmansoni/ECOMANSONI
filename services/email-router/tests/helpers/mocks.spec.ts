/**
 * tests/helpers/mocks.spec.ts
 * Переиспользуемые моки для unit и integration тестов.
 * Файл экспортирует утилиты и не содержит test cases (пустой suite).
 */

import { SignJWT } from 'jose';
import express, { type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'crypto';

// ─── MockRedis ─────────────────────────────────────────────────────────────

export class MockRedis {
  private store = new Map<string, string>();
  private sortedSets = new Map<string, Map<string, number>>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, value);
    return 'OK';
  }

  async setex(key: string, _ttl: number, value: string): Promise<'OK'> {
    this.store.set(key, value);
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys.flat()) {
      if (this.store.delete(key)) deleted++;
      if (this.sortedSets.delete(key)) deleted++;
    }
    return deleted;
  }

  async exists(key: string): Promise<number> {
    return this.store.has(key) || this.sortedSets.has(key) ? 1 : 0;
  }

  async expire(_key: string, _ttl: number): Promise<number> {
    return this.store.has(_key) || this.sortedSets.has(_key) ? 1 : 0;
  }

  async incr(key: string): Promise<number> {
    const current = parseInt(this.store.get(key) ?? '0', 10);
    const next = current + 1;
    this.store.set(key, next.toString());
    return next;
  }

  async decr(key: string): Promise<number> {
    const current = parseInt(this.store.get(key) ?? '0', 10);
    const next = current - 1;
    this.store.set(key, next.toString());
    return next;
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  async keys(pattern: string): Promise<string[]> {
    const rx = new RegExp(
      '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
    );
    return [...this.store.keys()].filter((k) => rx.test(k));
  }

  // ─── Sorted sets ────────────────────────────────────────────────────────

  async zadd(key: string, score: number, member: string): Promise<number> {
    if (!this.sortedSets.has(key)) this.sortedSets.set(key, new Map());
    const set = this.sortedSets.get(key)!;
    const isNew = !set.has(member);
    set.set(member, score);
    return isNew ? 1 : 0;
  }

  async zcard(key: string): Promise<number> {
    return this.sortedSets.get(key)?.size ?? 0;
  }

  async zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number> {
    const set = this.sortedSets.get(key);
    if (!set) return 0;
    let removed = 0;
    const lo = Number(min);
    const hi = Number(max);
    for (const [member, score] of [...set.entries()]) {
      if (score >= lo && score <= hi) {
        set.delete(member);
        removed++;
      }
    }
    return removed;
  }

  async scan(
    _cursor: string,
    _match: string,
    pattern: string,
    _count: string,
    _n: number,
  ): Promise<[string, string[]]> {
    const rx = new RegExp(
      '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
    );
    const all = [...this.store.keys(), ...this.sortedSets.keys()];
    return ['0', all.filter((k) => rx.test(k))];
  }

  // ─── Pipeline ──────────────────────────────────────────────────────────

  pipeline() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const redis = this;
    const ops: Array<() => Promise<unknown>> = [];

    const pipe = {
      get: (key: string) => { ops.push(() => redis.get(key)); return pipe; },
      set: (key: string, val: string) => { ops.push(() => redis.set(key, val)); return pipe; },
      setex: (key: string, ttl: number, val: string) => { ops.push(() => redis.setex(key, ttl, val)); return pipe; },
      del: (...keys: string[]) => { ops.push(() => redis.del(...keys)); return pipe; },
      expire: (key: string, ttl: number) => { ops.push(() => redis.expire(key, ttl)); return pipe; },
      incr: (key: string) => { ops.push(() => redis.incr(key)); return pipe; },
      decr: (key: string) => { ops.push(() => redis.decr(key)); return pipe; },
      zadd: (key: string, score: number, member: string) => { ops.push(() => redis.zadd(key, score, member)); return pipe; },
      zcard: (key: string) => { ops.push(() => redis.zcard(key)); return pipe; },
      zremrangebyscore: (key: string, min: number | string, max: number | string) => {
        ops.push(() => redis.zremrangebyscore(key, min, max)); return pipe;
      },
      exec: async (): Promise<Array<[null, unknown]>> => {
        const results: Array<[null, unknown]> = [];
        for (const op of ops) results.push([null, await op()]);
        return results;
      },
    };
    return pipe;
  }

  /** Test helper — clears all stored data */
  clear(): void {
    this.store.clear();
    this.sortedSets.clear();
  }

  /** Test helper — exposes raw store for assertions */
  getRaw(key: string): string | undefined {
    return this.store.get(key);
  }
}

// ─── MockPool ─────────────────────────────────────────────────────────────

export interface MockQueryResult {
  rows: Record<string, unknown>[];
  rowCount?: number;
}

export class MockPool {
  private results = new Map<string, MockQueryResult>();
  public queries: Array<{ text: string; params: unknown[] }> = [];

  setupQueryResult(matcher: string, result: MockQueryResult): void {
    this.results.set(matcher, result);
  }

  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number }> {
    this.queries.push({ text, params: params ?? [] });
    for (const [pattern, result] of this.results) {
      if (text.includes(pattern)) {
        return { rows: result.rows as T[], rowCount: result.rowCount ?? result.rows.length };
      }
    }
    return { rows: [], rowCount: 0 };
  }

  clearQueries(): void {
    this.queries = [];
  }

  lastQuery(): { text: string; params: unknown[] } | undefined {
    return this.queries[this.queries.length - 1];
  }

  queriesMatching(substr: string): Array<{ text: string; params: unknown[] }> {
    return this.queries.filter((q) => q.text.includes(substr));
  }
}

// ─── JWT helpers ───────────────────────────────────────────────────────────

export const TEST_JWT_SECRET = 'test-secret-key-must-be-at-least-32-characters-long';

/**
 * createTestJWT — создаёт подписанный HS256 JWT для тестов.
 */
export async function createTestJWT(
  payload: Record<string, unknown>,
  secret: string = TEST_JWT_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
}

/**
 * createIntegrationToken — создаёт "fake JWT" для integration тестов.
 * Мок auth middleware декодирует payload из parts[1] (base64url JSON).
 */
export function createIntegrationToken(options: {
  tenantId?: string;
  role?: 'app' | 'service' | 'admin';
  sub?: string;
  email?: string;
}): string {
  const payload = {
    sub: options.sub ?? options.tenantId ?? 'test-user-id',
    tenant_id: options.tenantId ?? 'test-tenant-id',
    role: options.role ?? 'app',
    email: options.email ?? 'test@example.com',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `eyJhbGciOiJIUzI1NiJ9.${encoded}.test-sig`;
}

// ─── Test env ──────────────────────────────────────────────────────────────

export const TEST_ENV = {
  PORT: 3100,
  NODE_ENV: 'development' as const,
  LOG_LEVEL: 'silent' as const,
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  DATABASE_POOL_MIN: 1,
  DATABASE_POOL_MAX: 5,
  REDIS_URL: 'redis://localhost:6379',
  REDIS_PASSWORD: undefined as string | undefined,
  SUPABASE_JWT_SECRET: TEST_JWT_SECRET,
  SUPABASE_JWKS_URL: 'http://localhost:1/.well-known/jwks.json',
  SMTP_HOST: 'localhost',
  SMTP_PORT: 587,
  SMTP_SECURE: false,
  SMTP_USER: undefined as string | undefined,
  SMTP_PASS: undefined as string | undefined,
  DEFAULT_FROM_EMAIL: 'noreply@mansoni.ru',
  DEFAULT_FROM_NAME: 'Mansoni Platform',
  RATE_LIMIT_PER_TENANT_PER_MINUTE: 60,
  RATE_LIMIT_BULK_PER_HOUR: 1000,
  CIRCUIT_BREAKER_THRESHOLD: 5,
  CIRCUIT_BREAKER_RESET_MS: 30000,
  EMAIL_ENCRYPTION_KEY: 'test-encryption-key-must-be-32-chars-long-!!',
  CORS_ORIGINS: 'http://localhost:3000,http://localhost:5173',
  ADMIN_IP_ALLOWLIST: '*',
};

// ─── Mock Logger ───────────────────────────────────────────────────────────

interface MockLoggerInstance {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  trace: (...args: unknown[]) => void;
  fatal: (...args: unknown[]) => void;
  child: () => MockLoggerInstance;
}

export function createMockLogger(): MockLoggerInstance {
  const l: MockLoggerInstance = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    trace: () => {},
    fatal: () => {},
    child: () => l,
  };
  return l;
}

// ─── Mock Services ─────────────────────────────────────────────────────────

export function createMockQueueService() {
  return {
    addSendJob: async (_job: unknown) => randomUUID(),
    addBatchJob: async (_jobs: unknown, _batchId: string) => randomUUID(),
    addBounceJob: async (_job: unknown) => randomUUID(),
    addRetryJob: async (_job: unknown, _delay: number) => randomUUID(),
    getQueueStats: async () => ({
      send: { waiting: 0, active: 0, failed: 0 },
      retry: { waiting: 0, active: 0, failed: 0 },
      bounce: { waiting: 0, active: 0, failed: 0 },
      batch: { waiting: 0, active: 0, failed: 0 },
    }),
    replayFailedJob: async (_queue: string, _jobId: string): Promise<void> => {},
    startWorkers: () => {},
    shutdown: async (): Promise<void> => {},
  };
}

export function createMockSuppressionService(overrides?: {
  isSuppressed?: (tenantId: string, email: string) => Promise<string | null>;
}) {
  return {
    isSuppressed: overrides?.isSuppressed ?? (async (_tenantId: string, _email: string) => null as string | null),
    filterSuppressed: async (_tenantId: string, emails: string[]) => ({
      allowed: emails,
      suppressed: [] as Array<{ email: string; reason: string }>,
    }),
    add: async (_tenantId: string, _entry: unknown): Promise<void> => {},
    remove: async (_tenantId: string, _email: string) => true,
    list: async (_tenantId: string, _opts: unknown) => ({ items: [], total: 0 }),
    gdprErase: async (_email: string) => ({ deletedCount: 0 }),
    cleanupExpired: async () => 0,
  };
}

export function createMockIdempotencyService(overrides?: {
  isDuplicate?: boolean;
  existingMessageId?: string;
}) {
  return {
    check: async (_tenantId: string, _key: string) => ({
      isDuplicate: overrides?.isDuplicate ?? false,
      existingMessageId: overrides?.existingMessageId,
      existingStatus: overrides?.isDuplicate ? 'queued' : undefined,
    }),
    register: async (_tenantId: string, _key: string, _messageId: string, _status: string): Promise<void> => {},
    updateStatus: async (_tenantId: string, _key: string, _messageId: string, _status: string): Promise<void> => {},
  };
}

export function createMockTenantRateLimiter(overrides?: { allowed?: boolean }) {
  return {
    checkLimit: async (_tenantId: string, _limits: unknown) => ({
      allowed: overrides?.allowed ?? true,
      remaining: 59,
    }),
    recordUsage: async (_tenantId: string, _count?: number): Promise<void> => {},
  };
}

export function createMockTemplateService() {
  return {
    findTemplate: async (_opts: unknown) => null as unknown,
    render: async (_template: unknown, _data: unknown) => ({
      subject: 'Test Subject',
      html: '<p>Test HTML</p>',
      text: 'Test Text',
    }),
    renderInline: (_opts: unknown) => ({
      subject: 'Inline Subject',
      html: '<p>Inline HTML</p>',
      text: 'Inline Text',
    }),
  };
}

export function createMockBounceProcessor() {
  return {
    processBounce: async (_job: unknown): Promise<void> => {},
    processWebhookBounce: async (_payload: unknown): Promise<void> => {},
    getStats: async (_tenantId: string, _days?: number) => ({
      total: 0, hard: 0, soft: 0, complaint: 0, byDay: [],
    }),
  };
}

export function createMockSendService() {
  return {
    processSendJob: async (_job: unknown): Promise<void> => {},
    verifyConnection: async () => true,
    getCircuitState: async () => 'CLOSED' as const,
    shutdown: async (): Promise<void> => {},
  };
}

// ─── createTestApp ─────────────────────────────────────────────────────────

export interface TestAppContext {
  app: express.Express;
  db: MockPool;
  redis: MockRedis;
  queueService: ReturnType<typeof createMockQueueService>;
  suppressionService: ReturnType<typeof createMockSuppressionService>;
  idempotencyService: ReturnType<typeof createMockIdempotencyService>;
  tenantRateLimiter: ReturnType<typeof createMockTenantRateLimiter>;
  templateService: ReturnType<typeof createMockTemplateService>;
  bounceProcessor: ReturnType<typeof createMockBounceProcessor>;
  sendService: ReturnType<typeof createMockSendService>;
  startedAt: Date;
}

/**
 * Создаёт Express app с mock сервисами для integration тестов.
 *
 * Auth: токен = "eyJ....BASE64(JSON payload).sig"
 * Payload содержит { sub, tenant_id, role, email }
 */
export function createTestApp(overrides?: Partial<TestAppContext>): TestAppContext {
  const db = (overrides?.db as MockPool | undefined) ?? new MockPool();
  const redis = (overrides?.redis as MockRedis | undefined) ?? new MockRedis();
  const queueService = overrides?.queueService ?? createMockQueueService();
  const suppressionService = overrides?.suppressionService ?? createMockSuppressionService();
  const idempotencyService = overrides?.idempotencyService ?? createMockIdempotencyService();
  const tenantRateLimiter = overrides?.tenantRateLimiter ?? createMockTenantRateLimiter();
  const templateService = overrides?.templateService ?? createMockTemplateService();
  const bounceProcessor = overrides?.bounceProcessor ?? createMockBounceProcessor();
  const sendService = overrides?.sendService ?? createMockSendService();
  const startedAt = new Date();

  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Request context injection
  app.use((req: Request, res: Response, next: NextFunction) => {
    (req as any).requestId = (req.headers['x-request-id'] as string) ?? randomUUID();
    (req as any).log = createMockLogger();
    res.setHeader('X-Request-Id', (req as any).requestId);
    next();
  });

  // ─── Health routes ──────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'email-router',
      uptime: Math.floor((Date.now() - startedAt.getTime()) / 1000),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/ready', async (_req, res) => {
    const checks: Record<string, { status: string; latencyMs?: number }> = {};
    let allOk = true;
    try { await db.query('SELECT 1'); checks['postgres'] = { status: 'ok', latencyMs: 0 }; }
    catch { checks['postgres'] = { status: 'error' }; allOk = false; }
    try { await redis.ping(); checks['redis'] = { status: 'ok', latencyMs: 0 }; }
    catch { checks['redis'] = { status: 'error' }; allOk = false; }
    const smtpOk = await sendService.verifyConnection();
    checks['smtp'] = { status: smtpOk ? 'ok' : 'degraded' };
    checks['queues'] = { status: 'ok' };

    res.status(allOk ? 200 : 503).json({
      status: allOk ? 'ready' : 'not_ready',
      checks,
      uptime: Math.floor((Date.now() - startedAt.getTime()) / 1000),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.end('# HELP email_router_test test\n# TYPE email_router_test counter\nemail_router_test 0\n');
  });

  // ─── Auth mock middleware ────────────────────────────────────────────────
  function authMock(roles?: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const auth = req.headers.authorization;
      if (!auth?.startsWith('Bearer ')) {
        res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'Missing or invalid Authorization header',
          requestId: (req as any).requestId,
        });
        return;
      }
      try {
        const token = auth.slice(7);
        const parts = token.split('.');
        if (parts.length < 2) throw new Error('malformed');
        const decoded = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf-8'));
        (req as any).auth = {
          sub: decoded.sub ?? 'test-user',
          tenantId: decoded.tenant_id ?? decoded.sub ?? 'test-tenant',
          role: decoded.role ?? 'app',
          email: decoded.email,
        };
        if (roles?.length && !roles.includes((req as any).auth.role)) {
          res.status(403).json({
            error: 'FORBIDDEN',
            message: `Required roles: ${roles.join(', ')}`,
            requestId: (req as any).requestId,
          });
          return;
        }
        next();
      } catch {
        res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'Invalid or expired token',
          requestId: (req as any).requestId,
        });
      }
    };
  }

  // ─── Email routes ───────────────────────────────────────────────────────
  const emailRouter = express.Router();

  emailRouter.post('/send', authMock(), async (req, res) => {
    try {
      const { to, subject, html, text, templateId, templateSlug, idempotencyKey, priority } = req.body;

      // Validation
      if (!Array.isArray(to) || to.length === 0) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'to must be a non-empty array' },
          requestId: (req as any).requestId, timestamp: new Date().toISOString(),
        });
        return;
      }
      if (!subject || typeof subject !== 'string' || subject.length === 0) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'subject is required' },
          requestId: (req as any).requestId, timestamp: new Date().toISOString(),
        });
        return;
      }
      if (!html && !text && !templateId && !templateSlug) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Either html, text, templateId, or templateSlug must be provided' },
          requestId: (req as any).requestId, timestamp: new Date().toISOString(),
        });
        return;
      }

      const tenantId = (req as any).auth.tenantId;

      // Idempotency
      if (idempotencyKey) {
        const idem = await idempotencyService.check(tenantId, idempotencyKey);
        if (idem.isDuplicate) {
          res.status(200).json({
            success: true,
            data: { messageId: idem.existingMessageId, status: idem.existingStatus, duplicate: true },
            requestId: (req as any).requestId, timestamp: new Date().toISOString(),
          });
          return;
        }
      }

      // Suppression
      const toEmails = (to as Array<{ email: string }>).map((r) => r.email);
      const { allowed, suppressed } = await suppressionService.filterSuppressed(tenantId, toEmails);
      if (allowed.length === 0) {
        res.status(422).json({
          success: false,
          error: { code: 'ALL_RECIPIENTS_SUPPRESSED', message: 'All recipients are in suppression list', details: suppressed },
          requestId: (req as any).requestId, timestamp: new Date().toISOString(),
        });
        return;
      }

      // Template
      if (templateId || templateSlug) {
        const tpl = await templateService.findTemplate({ id: templateId, slug: templateSlug, tenantId });
        if (!tpl) {
          res.status(404).json({
            success: false,
            error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found' },
            requestId: (req as any).requestId, timestamp: new Date().toISOString(),
          });
          return;
        }
      }

      const messageId = randomUUID();
      await db.query(`INSERT INTO email_messages (id, tenant_id) VALUES ($1, $2)`, [messageId, tenantId]);
      if (idempotencyKey) await idempotencyService.register(tenantId, idempotencyKey, messageId, 'queued');
      await queueService.addSendJob({ messageId, tenantId, to, from: { email: TEST_ENV.DEFAULT_FROM_EMAIL, name: TEST_ENV.DEFAULT_FROM_NAME }, subject, html, text, priority: priority ?? 3, attempt: 1, maxRetries: 5 } as any);
      await tenantRateLimiter.recordUsage(tenantId);
      await db.query(`INSERT INTO email_events (message_id, event_type) VALUES ($1, 'queued')`, [messageId]);

      res.status(202).json({
        success: true,
        data: { messageId, status: 'queued', suppressed },
        requestId: (req as any).requestId, timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      (req as any).log.error({ err }, 'Send failed');
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to queue email' },
        requestId: (req as any).requestId, timestamp: new Date().toISOString(),
      });
    }
  });

  emailRouter.post('/bulk', authMock(['service', 'admin']), async (req, res) => {
    try {
      const { messages, batchId: batchIdIn } = req.body;
      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'messages must be non-empty array' }, requestId: (req as any).requestId, timestamp: new Date().toISOString() });
        return;
      }
      const tenantId = (req as any).auth.tenantId;
      const batchId = batchIdIn ?? randomUUID();
      const messageIds: string[] = [];
      for (const msg of messages as any[]) {
        const mid = randomUUID();
        messageIds.push(mid);
        await db.query(`INSERT INTO email_messages (id, tenant_id) VALUES ($1, $2)`, [mid, tenantId]);
      }
      const jobs = (messages as any[]).map((msg, i) => ({ messageId: messageIds[i], tenantId, to: msg.to, from: { email: TEST_ENV.DEFAULT_FROM_EMAIL, name: TEST_ENV.DEFAULT_FROM_NAME }, subject: msg.subject, html: msg.html, text: msg.text, priority: msg.priority ?? 3, attempt: 1, maxRetries: 5 }));
      await queueService.addBatchJob(jobs, batchId);
      await tenantRateLimiter.recordUsage(tenantId, messages.length);
      res.status(202).json({ success: true, data: { batchId, messageIds, count: messages.length, status: 'queued' }, requestId: (req as any).requestId, timestamp: new Date().toISOString() });
    } catch {
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed' }, requestId: (req as any).requestId, timestamp: new Date().toISOString() });
    }
  });

  emailRouter.get('/status/:messageId', authMock(), async (req, res) => {
    try {
      const { messageId } = req.params;
      const tenantId = (req as any).auth.tenantId;
      const msgResult = await db.query(`SELECT id, status FROM email_messages WHERE id = $1 AND tenant_id = $2`, [messageId, tenantId]);
      if (msgResult.rows.length === 0) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Message not found' }, requestId: (req as any).requestId, timestamp: new Date().toISOString() });
        return;
      }
      const msg = msgResult.rows[0]!;
      const eventsResult = await db.query(`SELECT event_type, created_at FROM email_events WHERE message_id = $1`, [messageId]);
      res.json({
        success: true,
        data: {
          id: msg['id'], status: msg['status'], smtpMessageId: null, retryCount: 0,
          events: eventsResult.rows.map((e) => ({ eventType: e['event_type'], createdAt: e['created_at'], smtpCode: null, smtpResponse: null })),
          createdAt: new Date().toISOString(), sentAt: null,
        },
        requestId: (req as any).requestId, timestamp: new Date().toISOString(),
      });
    } catch {
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed' }, requestId: (req as any).requestId, timestamp: new Date().toISOString() });
    }
  });

  emailRouter.post('/webhooks/bounce', async (req, res) => {
    try {
      const { bounceType, recipient } = req.body;
      if (!bounceType || !recipient) {
        res.status(400).json({ success: false, error: 'Invalid bounce payload' });
        return;
      }
      await bounceProcessor.processWebhookBounce(req.body);
      res.status(200).json({ success: true });
    } catch {
      res.status(500).json({ success: false, error: 'Internal error' });
    }
  });

  app.use('/email', emailRouter);

  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: `Route not found: ${req.method} ${req.path}` },
      requestId: (req as any).requestId, timestamp: new Date().toISOString(),
    });
  });

  return { app, db, redis, queueService, suppressionService, idempotencyService, tenantRateLimiter, templateService, bounceProcessor, sendService, startedAt };
}

