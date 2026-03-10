/**
 * tests/integration/api.test.ts
 *
 * Интеграционные тесты API email-router.
 * Использует реальный Express app с mock сервисами (без реальных DB/Redis).
 *
 * Auth: токен = createIntegrationToken({ tenantId, role })
 * Токен декодируется mock middleware без криптографической верификации.
 *
 * Покрываемые endpoints:
 *  POST /email/send
 *  POST /email/bulk
 *  GET  /email/status/:id
 *  POST /email/webhooks/bounce
 *  GET  /health
 *  GET  /ready
 *  GET  /metrics
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import http from 'http';
import {
  MockPool,
  MockRedis,
  createIntegrationToken,
  createTestApp,
  createMockIdempotencyService,
  createMockSuppressionService,
  createMockBounceProcessor,
  createMockTemplateService,
  TEST_ENV,
} from '../helpers/mocks.spec.js';

// ─── Test server setup ────────────────────────────────────────────────────────

let server: http.Server;
let baseUrl: string;
let ctx: ReturnType<typeof createTestApp>;

beforeAll(async () => {
  ctx = createTestApp();
  server = http.createServer(ctx.app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiPost(path: string, body: unknown, token?: string) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function apiGet(path: string, token?: string) {
  return fetch(`${baseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

const APP_TOKEN = createIntegrationToken({ tenantId: 'tenant-integration-test', role: 'app' });
const SERVICE_TOKEN = createIntegrationToken({ tenantId: 'tenant-integration-test', role: 'service' });
const ADMIN_TOKEN = createIntegrationToken({ tenantId: 'tenant-integration-test', role: 'admin' });

const VALID_SEND_BODY = {
  to: [{ email: 'recipient@example.com', name: 'Recipient' }],
  subject: 'Integration Test Email',
  text: 'Hello from integration test',
  idempotencyKey: 'test-idem-key-001',
};

// ─── POST /email/send ─────────────────────────────────────────────────────────

describe('POST /email/send', () => {
  beforeEach(() => {
    ctx.db.clearQueries();
  });

  it('1. успешная отправка → 202 + messageId в data', async () => {
    const res = await apiPost('/email/send', VALID_SEND_BODY, APP_TOKEN);

    expect(res.status).toBe(202);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.data.messageId).toBeDefined();
    expect(typeof body.data.messageId).toBe('string');
    expect(body.data.status).toBe('queued');
    expect(body.requestId).toBeDefined();
    expect(body.timestamp).toBeDefined();
  });

  it('2. невалидный body → 400 с VALIDATION_ERROR', async () => {
    const res = await apiPost('/email/send', { subject: 'Missing to field' }, APP_TOKEN);

    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('3. тело без html/text/template → 400', async () => {
    const res = await apiPost(
      '/email/send',
      { to: [{ email: 'x@x.com' }], subject: 'No body' },
      APP_TOKEN,
    );

    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('4. нет Authorization header → 401', async () => {
    const res = await apiPost('/email/send', VALID_SEND_BODY);

    expect(res.status).toBe(401);
    const body = await res.json() as any;
    expect(body.error).toBe('UNAUTHORIZED');
  });

  it('5. idempotency duplicate → 200 с duplicate=true', async () => {
    const existingMsgId = '22222222-2222-2222-2222-222222222222';
    const idempotencySvc = createMockIdempotencyService({
      isDuplicate: true,
      existingMessageId: existingMsgId,
    });

    // Создаём отдельный app с замоканным idempotency service
    const appCtx = createTestApp({ idempotencyService: idempotencySvc as any });
    const localServer = http.createServer(appCtx.app);
    await new Promise<void>((r) => localServer.listen(0, '127.0.0.1', () => r()));
    const { port } = localServer.address() as { port: number };
    const url = `http://127.0.0.1:${port}`;

    try {
      const res = await fetch(`${url}/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${APP_TOKEN}` },
        body: JSON.stringify({ ...VALID_SEND_BODY, idempotencyKey: 'dup-key' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      expect(body.data.duplicate).toBe(true);
      expect(body.data.messageId).toBe(existingMsgId);
    } finally {
      await new Promise<void>((r) => localServer.close(() => r()));
    }
  });

  it('6. все получатели suppressed → 422 ALL_RECIPIENTS_SUPPRESSED', async () => {
    const suppressionSvc = createMockSuppressionService({
      isSuppressed: async (_tenantId, email) => {
        return email.includes('suppressed') ? 'bounce_hard' : null;
      },
    });
    // Переопределяем filterSuppressed
    const origFilter = suppressionSvc.filterSuppressed;
    suppressionSvc.filterSuppressed = async (tenantId, emails) => ({
      allowed: [],
      suppressed: emails.map((e) => ({ email: e, reason: 'bounce_hard' })),
    });

    const appCtx = createTestApp({ suppressionService: suppressionSvc as any });
    const localServer = http.createServer(appCtx.app);
    await new Promise<void>((r) => localServer.listen(0, '127.0.0.1', () => r()));
    const { port } = localServer.address() as { port: number };
    const url = `http://127.0.0.1:${port}`;

    try {
      const res = await fetch(`${url}/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${APP_TOKEN}` },
        body: JSON.stringify({ to: [{ email: 'suppressed@example.com' }], subject: 'Test', text: 'Test' }),
      });

      expect(res.status).toBe(422);
      const body = await res.json() as any;
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('ALL_RECIPIENTS_SUPPRESSED');
    } finally {
      await new Promise<void>((r) => localServer.close(() => r()));
    }
  });

  it('7. с template (templateSlug) → 202 при найденном шаблоне', async () => {
    const templateSvc = createMockTemplateService();
    // Шаблон найден
    templateSvc.findTemplate = async () => ({
      id: 'tmpl-001',
      slug: 'welcome',
      subject_template: 'Welcome {{name}}',
      body_html: '<p>Welcome</p>',
      body_text: 'Welcome',
      body_mjml: null,
      variables: {},
      locale: 'ru',
    }) as any;

    const appCtx = createTestApp({ templateService: templateSvc as any });
    const localServer = http.createServer(appCtx.app);
    await new Promise<void>((r) => localServer.listen(0, '127.0.0.1', () => r()));
    const { port } = localServer.address() as { port: number };
    const url = `http://127.0.0.1:${port}`;

    try {
      const res = await fetch(`${url}/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${APP_TOKEN}` },
        body: JSON.stringify({
          to: [{ email: 'user@example.com' }],
          subject: 'Test',
          templateSlug: 'welcome',
          templateData: { name: 'Alice' },
        }),
      });

      expect(res.status).toBe(202);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
    } finally {
      await new Promise<void>((r) => localServer.close(() => r()));
    }
  });

  it('8. template не найден → 404 TEMPLATE_NOT_FOUND', async () => {
    const templateSvc = createMockTemplateService();
    templateSvc.findTemplate = async () => null;

    const appCtx = createTestApp({ templateService: templateSvc as any });
    const localServer = http.createServer(appCtx.app);
    await new Promise<void>((r) => localServer.listen(0, '127.0.0.1', () => r()));
    const { port } = localServer.address() as { port: number };
    const url = `http://127.0.0.1:${port}`;

    try {
      const res = await fetch(`${url}/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${APP_TOKEN}` },
        body: JSON.stringify({
          to: [{ email: 'user@example.com' }],
          subject: 'Test',
          templateSlug: 'nonexistent',
        }),
      });

      expect(res.status).toBe(404);
      const body = await res.json() as any;
      expect(body.error.code).toBe('TEMPLATE_NOT_FOUND');
    } finally {
      await new Promise<void>((r) => localServer.close(() => r()));
    }
  });
});

// ─── POST /email/bulk ─────────────────────────────────────────────────────────

describe('POST /email/bulk', () => {
  const VALID_BULK_BODY = {
    messages: [
      { to: [{ email: 'a@example.com' }], subject: 'Bulk 1', text: 'Text 1' },
      { to: [{ email: 'b@example.com' }], subject: 'Bulk 2', text: 'Text 2' },
    ],
  };

  it('9. успешная отправка bulk → 202 + batchId + messageIds', async () => {
    const res = await apiPost('/email/bulk', VALID_BULK_BODY, SERVICE_TOKEN);

    expect(res.status).toBe(202);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.data.batchId).toBeDefined();
    expect(body.data.messageIds).toHaveLength(2);
    expect(body.data.count).toBe(2);
    expect(body.data.status).toBe('queued');
  });

  it('10. bulk без auth → 401', async () => {
    const res = await apiPost('/email/bulk', VALID_BULK_BODY);

    expect(res.status).toBe(401);
  });

  it('11. bulk с app role (не service/admin) → 403', async () => {
    const res = await apiPost('/email/bulk', VALID_BULK_BODY, APP_TOKEN);

    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.error).toBe('FORBIDDEN');
  });

  it('12. bulk с admin role → 202', async () => {
    const res = await apiPost('/email/bulk', VALID_BULK_BODY, ADMIN_TOKEN);

    expect(res.status).toBe(202);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
  });

  it('13. bulk с невалидным body → 400', async () => {
    const res = await apiPost('/email/bulk', { messages: [] }, SERVICE_TOKEN);

    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ─── GET /email/status/:messageId ─────────────────────────────────────────────

describe('GET /email/status/:messageId', () => {
  it('14. найден → 200 + data с events', async () => {
    const msgId = '33333333-3333-3333-3333-333333333333';

    // Настраиваем DB ответы
    ctx.db.setupQueryResult('email_messages WHERE id', {
      rows: [{ id: msgId, status: 'sent' }],
    });
    ctx.db.setupQueryResult('email_events WHERE message_id', {
      rows: [
        { event_type: 'queued', created_at: new Date().toISOString() },
        { event_type: 'sent', created_at: new Date().toISOString() },
      ],
    });

    const appCtx = createTestApp({ db: ctx.db as any });
    const localServer = http.createServer(appCtx.app);
    await new Promise<void>((r) => localServer.listen(0, '127.0.0.1', () => r()));
    const { port } = localServer.address() as { port: number };

    try {
      const res = await fetch(`http://127.0.0.1:${port}/email/status/${msgId}`, {
        headers: { Authorization: `Bearer ${APP_TOKEN}` },
      });

      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(msgId);
      expect(body.data.status).toBe('sent');
      expect(body.data.events).toHaveLength(2);
      expect(body.data.events[0].eventType).toBe('queued');
    } finally {
      await new Promise<void>((r) => localServer.close(() => r()));
    }
  });

  it('15. не найден → 404 NOT_FOUND', async () => {
    // DB возвращает пусто
    const freshPool = new MockPool();
    freshPool.setupQueryResult('email_messages WHERE id', { rows: [] });

    const appCtx = createTestApp({ db: freshPool as any });
    const localServer = http.createServer(appCtx.app);
    await new Promise<void>((r) => localServer.listen(0, '127.0.0.1', () => r()));
    const { port } = localServer.address() as { port: number };

    try {
      const res = await fetch(`http://127.0.0.1:${port}/email/status/nonexistent-id`, {
        headers: { Authorization: `Bearer ${APP_TOKEN}` },
      });

      expect(res.status).toBe(404);
      const body = await res.json() as any;
      expect(body.error.code).toBe('NOT_FOUND');
    } finally {
      await new Promise<void>((r) => localServer.close(() => r()));
    }
  });

  it('16. без auth → 401', async () => {
    const res = await apiGet('/email/status/some-id');

    expect(res.status).toBe(401);
  });
});

// ─── POST /email/webhooks/bounce ──────────────────────────────────────────────

describe('POST /email/webhooks/bounce', () => {
  it('17. валидный bounce payload → 200 { success: true }', async () => {
    const res = await apiPost('/email/webhooks/bounce', {
      bounceType: 'hard',
      recipient: 'bounced@example.com',
      smtpCode: 550,
      smtpMessageId: '<msg-123@example.com>',
      timestamp: new Date().toISOString(),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
  });

  it('18. невалидный payload (нет recipient) → 400', async () => {
    const res = await apiPost('/email/webhooks/bounce', {
      bounceType: 'hard',
      // recipient отсутствует
    });

    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
  });

  it('19. bounce webhook не требует auth', async () => {
    // Webhooks не должны требовать авторизации
    const res = await apiPost('/email/webhooks/bounce', {
      bounceType: 'soft',
      recipient: 'soft@example.com',
    });

    // 200 (без auth header, но webhook не авторизован)
    expect(res.status).toBe(200);
  });

  it('20. если bounceProcessor бросает → 500', async () => {
    const errorProcessor = createMockBounceProcessor();
    errorProcessor.processWebhookBounce = vi.fn(async () => {
      throw new Error('Processing failed');
    });

    const appCtx = createTestApp({ bounceProcessor: errorProcessor as any });
    const localServer = http.createServer(appCtx.app);
    await new Promise<void>((r) => localServer.listen(0, '127.0.0.1', () => r()));
    const { port } = localServer.address() as { port: number };

    try {
      const res = await fetch(`http://127.0.0.1:${port}/email/webhooks/bounce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bounceType: 'hard', recipient: 'err@example.com' }),
      });

      expect(res.status).toBe(500);
    } finally {
      await new Promise<void>((r) => localServer.close(() => r()));
    }
  });
});

// ─── GET /health ──────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('21. всегда 200 { status: "ok" }', async () => {
    const res = await apiGet('/health');

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('ok');
    expect(body.service).toBe('email-router');
    expect(typeof body.uptime).toBe('number');
    expect(body.timestamp).toBeDefined();
  });

  it('22. health не требует auth', async () => {
    // Без токена должно работать
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
  });
});

// ─── GET /ready ───────────────────────────────────────────────────────────────

describe('GET /ready', () => {
  it('23. returns 200 when all checks pass', async () => {
    const res = await apiGet('/ready');

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('ready');
    expect(body.checks).toBeDefined();
    expect(body.checks.postgres).toBeDefined();
    expect(body.checks.redis).toBeDefined();
  });
});

// ─── GET /metrics ─────────────────────────────────────────────────────────────

describe('GET /metrics', () => {
  it('24. возвращает Prometheus text format', async () => {
    const res = await apiGet('/metrics');

    expect(res.status).toBe(200);
    const text = await res.text();
    // Prometheus формат начинается с '#'
    expect(text).toContain('#');
  });
});

// ─── 404 для несуществующих роутов ────────────────────────────────────────────

describe('404 для несуществующих роутов', () => {
  it('25. unknown route → 404 NOT_FOUND', async () => {
    const res = await apiGet('/unknown/route');

    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
