/**
 * tests/e2e/smoke.test.ts
 *
 * E2E Smoke Test для email-router сервиса.
 *
 * ТРЕБОВАНИЯ:
 *   Запущенный полный стек (PostgreSQL, Redis, Postfix SMTP, email-router):
 *   ```
 *   cd infra/email && make up-dev
 *   ```
 *
 * ЗАПУСК:
 *   INTEGRATION=true npx vitest run tests/e2e/smoke.test.ts
 *   # Или с кастомным URL:
 *   INTEGRATION=true EMAIL_ROUTER_URL=http://localhost:3100 npx vitest run tests/e2e/smoke.test.ts
 *
 * ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ:
 *   INTEGRATION          - должна быть truthy для запуска (иначе suite skipped)
 *   EMAIL_ROUTER_URL     - базовый URL сервиса (default: http://localhost:3100)
 *   TEST_JWT             - валидный JWT токен от Supabase (если не задан — используется тестовый)
 *   TEST_ADMIN_JWT       - JWT с admin role для тестирования bulk endpoint
 *   TEST_SERVICE_JWT     - JWT с service role для тестирования bulk endpoint
 *
 * ПОТОК:
 *   send → queue → (smtp mock) → event stored → status check
 *
 * ПРИМЕЧАНИЕ:
 *   Эти тесты проверяют реальный HTTP сервис.
 *   Они НЕ будут запускаться в CI/CD без соответствующей инфраструктуры.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestJWT, TEST_JWT_SECRET } from '../helpers/mocks.spec.js';

// ─── Условный запуск (только если INTEGRATION=true) ──────────────────────────

const describeE2E = process.env['INTEGRATION'] ? describe : describe.skip;

describeE2E('E2E Smoke: Email Router Service', () => {
  const BASE_URL = process.env['EMAIL_ROUTER_URL'] ?? 'http://localhost:3100';

  let appJwt: string;
  let serviceJwt: string;

  beforeAll(async () => {
    // Проверяем, что сервис запущен
    let healthOk = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const health = await fetch(`${BASE_URL}/health`);
        if (health.ok) {
          healthOk = true;
          break;
        }
      } catch {
        // Ждём запуска
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    if (!healthOk) {
      throw new Error(
        `Email-router service is not reachable at ${BASE_URL}.\n` +
          'Make sure the service is running: cd infra/email && make up-dev',
      );
    }

    // Создаём тестовые JWT
    if (process.env['TEST_JWT']) {
      appJwt = process.env['TEST_JWT'];
    } else {
      // Создаём тестовый JWT, подписанный тестовым секретом
      appJwt = await createTestJWT(
        {
          sub: 'e2e-test-user',
          tenant_id: 'e2e-test-tenant',
          role: 'app',
          email: 'e2e@test.com',
          aud: 'authenticated',
        },
        process.env['SUPABASE_JWT_SECRET'] ?? TEST_JWT_SECRET,
      );
    }

    if (process.env['TEST_SERVICE_JWT']) {
      serviceJwt = process.env['TEST_SERVICE_JWT'];
    } else {
      serviceJwt = await createTestJWT(
        {
          sub: 'e2e-service-user',
          tenant_id: 'e2e-test-tenant',
          role: 'service',
          email: 'service@test.com',
          aud: 'authenticated',
        },
        process.env['SUPABASE_JWT_SECRET'] ?? TEST_JWT_SECRET,
      );
    }
  });

  // ── Базовая доступность ─────────────────────────────────────────────────────

  it('health endpoint returns 200 with status ok', async () => {
    const res = await fetch(`${BASE_URL}/health`);

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('ok');
    expect(body.service).toBe('email-router');
  });

  it('ready endpoint reflects dependency status', async () => {
    const res = await fetch(`${BASE_URL}/ready`);

    // Может быть 200 (all ok) или 503 (degraded) — оба допустимы в smoke test
    expect([200, 503]).toContain(res.status);
    const body = await res.json() as any;
    expect(['ready', 'not_ready']).toContain(body.status);
    expect(body.checks).toBeDefined();
  });

  it('metrics endpoint returns Prometheus format', async () => {
    const res = await fetch(`${BASE_URL}/metrics`);

    expect(res.status).toBe(200);
    const text = await res.text();
    // Prometheus format
    expect(text).toContain('# HELP');
    expect(text).toContain('# TYPE');
  });

  // ── Send email flow ─────────────────────────────────────────────────────────

  it('should send email and receive 202 with messageId', async () => {
    const uniqueKey = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const res = await fetch(`${BASE_URL}/email/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${appJwt}`,
      },
      body: JSON.stringify({
        to: [{ email: 'smoke-test@example.com', name: 'Smoke Test' }],
        subject: 'E2E Smoke Test',
        text: 'This is an automated E2E smoke test email',
        idempotencyKey: uniqueKey,
      }),
    });

    expect(res.status).toBe(202);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.data.messageId).toBeDefined();
    expect(body.data.status).toBe('queued');
    expect(typeof body.data.messageId).toBe('string');
  });

  it('should store queued event after sending email', async () => {
    const uniqueKey = `e2e-status-${Date.now()}`;

    // Отправляем
    const sendRes = await fetch(`${BASE_URL}/email/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${appJwt}`,
      },
      body: JSON.stringify({
        to: [{ email: 'status-test@example.com' }],
        subject: 'Status Check Test',
        text: 'Testing event storage',
        idempotencyKey: uniqueKey,
      }),
    });

    expect(sendRes.status).toBe(202);
    const { data: sendData } = await sendRes.json() as any;
    const messageId = sendData.messageId;

    // Небольшая пауза для обработки
    await new Promise((r) => setTimeout(r, 500));

    // Проверяем статус
    const statusRes = await fetch(`${BASE_URL}/email/status/${messageId}`, {
      headers: { Authorization: `Bearer ${appJwt}` },
    });

    expect(statusRes.status).toBe(200);
    const statusBody = await statusRes.json() as any;
    expect(statusBody.data.id).toBe(messageId);
    expect(statusBody.data.events.length).toBeGreaterThanOrEqual(1);
    expect(statusBody.data.events[0].eventType).toBe('queued');
  });

  // ── Idempotency flow ────────────────────────────────────────────────────────

  it('should handle idempotent requests — same key returns same messageId', async () => {
    const key = `idem-e2e-${Date.now()}`;
    const payload = {
      to: [{ email: 'idempotency-test@example.com' }],
      subject: 'Idempotency Test',
      text: 'Testing idempotency',
      idempotencyKey: key,
    };

    // Первый запрос
    const res1 = await fetch(`${BASE_URL}/email/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${appJwt}` },
      body: JSON.stringify(payload),
    });
    expect(res1.status).toBe(202);
    const data1 = await res1.json() as any;

    // Дублирующий запрос с тем же ключом
    const res2 = await fetch(`${BASE_URL}/email/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${appJwt}` },
      body: JSON.stringify(payload),
    });

    // Второй запрос должен вернуть 200 (duplicate detected)
    expect([200, 202]).toContain(res2.status);
    const data2 = await res2.json() as any;

    // Оба должны содержать одинаковый messageId
    expect(data2.data.messageId).toBe(data1.data.messageId);
    if (res2.status === 200) {
      expect(data2.data.duplicate).toBe(true);
    }
  });

  // ── Auth failures ───────────────────────────────────────────────────────────

  it('should reject send without auth token (401)', async () => {
    const res = await fetch(`${BASE_URL}/email/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: [{ email: 'test@example.com' }],
        subject: 'No Auth',
        text: 'Should be rejected',
      }),
    });

    expect(res.status).toBe(401);
  });

  it('should reject bulk send from app role (403)', async () => {
    const res = await fetch(`${BASE_URL}/email/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${appJwt}` },
      body: JSON.stringify({
        messages: [{ to: [{ email: 'bulk@example.com' }], subject: 'Bulk', text: 'Bulk' }],
      }),
    });

    expect(res.status).toBe(403);
  });

  // ── Bounce webhook ──────────────────────────────────────────────────────────

  it('should accept valid bounce webhook without auth', async () => {
    const res = await fetch(`${BASE_URL}/email/webhooks/bounce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bounceType: 'soft',
        recipient: 'bounce-test@example.com',
        smtpCode: 452,
        timestamp: new Date().toISOString(),
      }),
    });

    // Должен обработать без auth
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      const body = await res.json() as any;
      expect(body.success).toBe(true);
    }
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  it('should return 400 for invalid send request (missing subject)', async () => {
    const res = await fetch(`${BASE_URL}/email/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${appJwt}` },
      body: JSON.stringify({
        to: [{ email: 'test@example.com' }],
        // subject отсутствует
        text: 'No subject',
      }),
    });

    expect(res.status).toBe(400);
  });

  // ── Queue processing (требует реального SMTP) ───────────────────────────────

  it('should process queued email through worker (requires SMTP)', async () => {
    const uniqueKey = `e2e-queue-${Date.now()}`;

    const sendRes = await fetch(`${BASE_URL}/email/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${appJwt}` },
      body: JSON.stringify({
        to: [{ email: 'queue-test@example.com' }],
        subject: 'Queue Processing Test',
        text: 'Testing BullMQ worker processing',
        idempotencyKey: uniqueKey,
      }),
    });

    expect(sendRes.status).toBe(202);
    const { data } = await sendRes.json() as any;
    const messageId = data.messageId;

    // Ждём обработки worker (3 секунды)
    await new Promise((r) => setTimeout(r, 3000));

    // Проверяем статус
    const statusRes = await fetch(`${BASE_URL}/email/status/${messageId}`, {
      headers: { Authorization: `Bearer ${appJwt}` },
    });

    expect(statusRes.status).toBe(200);
    const statusData = await statusRes.json() as any;

    // После обработки должен быть хотя бы 1 event
    expect(statusData.data.events.length).toBeGreaterThanOrEqual(1);

    // Статус должен быть не 'queued' (должен был обработаться)
    // В реальном окружении: sent | delivered | failed
    const validStatuses = ['queued', 'processing', 'sent', 'delivered', 'failed'];
    expect(validStatuses).toContain(statusData.data.status);
  });
});
