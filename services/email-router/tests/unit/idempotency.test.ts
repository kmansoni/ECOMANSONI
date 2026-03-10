/**
 * tests/unit/idempotency.test.ts
 *
 * Unit тесты для IdempotencyService.
 * Проверяет двухуровневую проверку идемпотентности: Redis → PostgreSQL.
 *
 * Покрываемые сценарии:
 *  1. check() возвращает isDuplicate=false для нового ключа
 *  2. check() возвращает isDuplicate=true из Redis кэша
 *  3. check() fallback в PG при cache miss
 *  4. check() после PG-попадания записывает в Redis
 *  5. register() сохраняет ключ в Redis с TTL
 *  6. updateStatus() обновляет запись в Redis если ключ существует
 *  7. updateStatus() не пишет в Redis если ключа нет
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockRedis, MockPool } from '../helpers/mocks.spec.js';

// ─── Мокируем logger ─────────────────────────────────────────────────────────
vi.mock('../../src/lib/logger.js', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  })),
  createLogger: vi.fn(),
}));

// ─── Импорт тестируемого модуля ───────────────────────────────────────────────
import { IdempotencyService } from '../../src/lib/idempotency.js';

const TENANT_ID = 'tenant-abc';
const IDEM_KEY = 'order-email-12345';
const MSG_ID = '11111111-1111-1111-1111-111111111111';
const CACHE_KEY = `idem:${TENANT_ID}:${IDEM_KEY}`;
const TTL = 86400;

describe('IdempotencyService', () => {
  let redis: MockRedis;
  let db: MockPool;
  let svc: IdempotencyService;

  beforeEach(() => {
    redis = new MockRedis();
    db = new MockPool();
    svc = new IdempotencyService(db as any, redis as any, TTL);
    vi.clearAllMocks();
  });

  // ── 1. Новый ключ ───────────────────────────────────────────────────────────

  it('1. returns isDuplicate=false for a new idempotency key', async () => {
    // Redis miss, DB miss
    const result = await svc.check(TENANT_ID, IDEM_KEY);

    expect(result.isDuplicate).toBe(false);
    expect(result.existingMessageId).toBeUndefined();
    expect(result.existingStatus).toBeUndefined();
  });

  // ── 2. Redis cache hit ──────────────────────────────────────────────────────

  it('2. returns isDuplicate=true from Redis cache (fast path)', async () => {
    // Предзаполняем Redis кэш
    await redis.set(CACHE_KEY, JSON.stringify({ messageId: MSG_ID, status: 'sent' }));

    const result = await svc.check(TENANT_ID, IDEM_KEY);

    expect(result.isDuplicate).toBe(true);
    expect(result.existingMessageId).toBe(MSG_ID);
    expect(result.existingStatus).toBe('sent');

    // DB не должна быть запрошена (только Redis)
    expect(db.queries).toHaveLength(0);
  });

  // ── 3. PG fallback при cache miss ──────────────────────────────────────────

  it('3. falls back to PostgreSQL when Redis has no entry', async () => {
    // Настраиваем ответ DB
    db.setupQueryResult('email_messages WHERE tenant_id', {
      rows: [{ id: MSG_ID, status: 'processing' }],
    });

    const result = await svc.check(TENANT_ID, IDEM_KEY);

    expect(result.isDuplicate).toBe(true);
    expect(result.existingMessageId).toBe(MSG_ID);
    expect(result.existingStatus).toBe('processing');

    // Должен быть один запрос к DB
    expect(db.queries).toHaveLength(1);
    expect(db.queries[0]!.text).toContain('email_messages');
    expect(db.queries[0]!.params).toEqual([TENANT_ID, IDEM_KEY]);
  });

  // ── 4. После PG-попадания кэш обновляется в Redis ──────────────────────────

  it('4. caches the result in Redis after a PostgreSQL hit', async () => {
    db.setupQueryResult('email_messages WHERE tenant_id', {
      rows: [{ id: MSG_ID, status: 'queued' }],
    });

    await svc.check(TENANT_ID, IDEM_KEY);

    // Теперь значение должно быть в Redis
    const cached = await redis.get(CACHE_KEY);
    expect(cached).not.toBeNull();
    const parsed = JSON.parse(cached!);
    expect(parsed.messageId).toBe(MSG_ID);
    expect(parsed.status).toBe('queued');

    // Второй вызов — уже из Redis (без DB запроса)
    db.clearQueries();
    const result2 = await svc.check(TENANT_ID, IDEM_KEY);
    expect(result2.isDuplicate).toBe(true);
    expect(db.queries).toHaveLength(0);
  });

  // ── 5. register() сохраняет ключ в Redis ───────────────────────────────────

  it('5. register() stores the idempotency key in Redis with TTL', async () => {
    await svc.register(TENANT_ID, IDEM_KEY, MSG_ID, 'queued');

    const stored = await redis.get(CACHE_KEY);
    expect(stored).not.toBeNull();

    const parsed = JSON.parse(stored!);
    expect(parsed.messageId).toBe(MSG_ID);
    expect(parsed.status).toBe('queued');
  });

  // ── 6. updateStatus() обновляет существующий ключ ──────────────────────────

  it('6. updateStatus() updates the Redis entry when key exists', async () => {
    // Сначала регистрируем
    await svc.register(TENANT_ID, IDEM_KEY, MSG_ID, 'queued');

    // Обновляем статус
    await svc.updateStatus(TENANT_ID, IDEM_KEY, MSG_ID, 'sent');

    const stored = await redis.get(CACHE_KEY);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.status).toBe('sent');
    expect(parsed.messageId).toBe(MSG_ID);
  });

  // ── 7. updateStatus() не пишет если ключа нет ──────────────────────────────

  it('7. updateStatus() does nothing when key does not exist in Redis', async () => {
    // Ключ не зарегистрирован
    await svc.updateStatus(TENANT_ID, IDEM_KEY, MSG_ID, 'sent');

    // Должен оставаться пустым
    const stored = await redis.get(CACHE_KEY);
    expect(stored).toBeNull();
  });

  // ── 8. Параллельные check() для одного ключа ───────────────────────────────

  it('8. concurrent check() calls return consistent results from cache', async () => {
    await redis.set(CACHE_KEY, JSON.stringify({ messageId: MSG_ID, status: 'processing' }));

    const [r1, r2, r3] = await Promise.all([
      svc.check(TENANT_ID, IDEM_KEY),
      svc.check(TENANT_ID, IDEM_KEY),
      svc.check(TENANT_ID, IDEM_KEY),
    ]);

    expect(r1.isDuplicate).toBe(true);
    expect(r2.isDuplicate).toBe(true);
    expect(r3.isDuplicate).toBe(true);
    expect(r1.existingMessageId).toBe(MSG_ID);
    expect(r2.existingMessageId).toBe(MSG_ID);
    expect(r3.existingMessageId).toBe(MSG_ID);

    // DB не должна быть вызвана
    expect(db.queries).toHaveLength(0);
  });
});
