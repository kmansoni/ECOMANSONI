/**
 * tests/unit/suppressionService.test.ts
 *
 * Unit тесты для SuppressionService.
 * Проверяет: Redis cache, PG fallback, negative caching, filterSuppressed.
 *
 * Покрываемые сценарии:
 *  1. isSuppressed() возвращает null для несупрессированного email
 *  2. isSuppressed() возвращает reason из Redis кэша
 *  3. isSuppressed() fallback в PG при cache miss
 *  4. isSuppressed() negative caching ('none' sentinel)
 *  5. filterSuppressed() корректно разделяет allowed/suppressed
 *  6. add() UPSERT в PG + обновляет Redis кэш
 *  7. remove() удаляет из PG + инвалидирует Redis кэш
 *  8. negative caching: sentinel 'none' → isSuppressed() = null
 *  9. filterSuppressed() — все suppressed → пустой allowed
 * 10. isSuppressed() нормализует email (lowercase + trim)
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
import { SuppressionService } from '../../src/services/suppressionService.js';

const TENANT = 'tenant-xyz';
const EMAIL = 'user@example.com';
const EMAIL_UPPER = '  USER@EXAMPLE.COM  ';
const CACHE_KEY = `supp:${TENANT}:${EMAIL}`;

describe('SuppressionService', () => {
  let redis: MockRedis;
  let db: MockPool;
  let svc: SuppressionService;

  beforeEach(() => {
    redis = new MockRedis();
    db = new MockPool();
    svc = new SuppressionService(db as any, redis as any);
    vi.clearAllMocks();
  });

  // ── 1. isSuppressed → null (не в списке) ────────────────────────────────────

  it('1. isSuppressed() returns null when email is not suppressed', async () => {
    // Redis miss, DB miss
    const result = await svc.isSuppressed(TENANT, EMAIL);

    expect(result).toBeNull();

    // Negative cache должен быть записан
    const cached = await redis.get(CACHE_KEY);
    expect(cached).toBe('none');
  });

  // ── 2. Redis cache hit ──────────────────────────────────────────────────────

  it('2. isSuppressed() returns reason from Redis cache without DB query', async () => {
    await redis.set(CACHE_KEY, 'bounce_hard');

    const result = await svc.isSuppressed(TENANT, EMAIL);

    expect(result).toBe('bounce_hard');
    // DB не должна быть запрошена
    expect(db.queries).toHaveLength(0);
  });

  // ── 3. PG fallback ──────────────────────────────────────────────────────────

  it('3. isSuppressed() falls back to PostgreSQL when Redis cache is empty', async () => {
    db.setupQueryResult('suppression_list', {
      rows: [{ reason: 'complaint' }],
    });

    const result = await svc.isSuppressed(TENANT, EMAIL);

    expect(result).toBe('complaint');

    // Должен быть один DB запрос
    const dbQueries = db.queriesMatching('suppression_list');
    expect(dbQueries).toHaveLength(1);
    expect(dbQueries[0]!.params).toEqual([TENANT, EMAIL]);
  });

  // ── 4. Negative caching (sentinel 'none') ───────────────────────────────────

  it('4. isSuppressed() returns null when Redis has negative sentinel "none"', async () => {
    // Устанавливаем negative sentinel
    await redis.set(CACHE_KEY, 'none');

    const result = await svc.isSuppressed(TENANT, EMAIL);

    expect(result).toBeNull();
    // DB НЕ должна быть вызвана
    expect(db.queries).toHaveLength(0);
  });

  // ── 5. filterSuppressed() разделяет allowed/suppressed ──────────────────────

  it('5. filterSuppressed() correctly separates allowed and suppressed emails', async () => {
    const emails = ['allowed@example.com', 'bounced@example.com', 'spam@example.com'];

    // bounce и spam — в Redis
    await redis.set(`supp:${TENANT}:bounced@example.com`, 'bounce_hard');
    await redis.set(`supp:${TENANT}:spam@example.com`, 'complaint');
    // allowed — нет ни в Redis, ни в DB

    const { allowed, suppressed } = await svc.filterSuppressed(TENANT, emails);

    expect(allowed).toEqual(['allowed@example.com']);
    expect(suppressed).toHaveLength(2);
    expect(suppressed.some((s) => s.email === 'bounced@example.com' && s.reason === 'bounce_hard')).toBe(true);
    expect(suppressed.some((s) => s.email === 'spam@example.com' && s.reason === 'complaint')).toBe(true);
  });

  // ── 6. add() UPSERT в PG + обновляет Redis кэш ──────────────────────────────

  it('6. add() performs UPSERT in PostgreSQL and warms the Redis cache', async () => {
    await svc.add(TENANT, { email: EMAIL, reason: 'bounce_hard' });

    // DB должен получить INSERT...ON CONFLICT
    const dbQueries = db.queriesMatching('suppression_list');
    expect(dbQueries.length).toBeGreaterThan(0);
    expect(dbQueries[0]!.text).toContain('ON CONFLICT');
    expect(dbQueries[0]!.params[0]).toBe(TENANT);
    expect(dbQueries[0]!.params[1]).toBe(EMAIL);
    expect(dbQueries[0]!.params[2]).toBe('bounce_hard');

    // Redis должен содержать reason
    const cached = await redis.get(CACHE_KEY);
    expect(cached).toBe('bounce_hard');
  });

  // ── 7. remove() удаляет из PG + инвалидирует Redis кэш ──────────────────────

  it('7. remove() deletes from PostgreSQL and invalidates Redis cache', async () => {
    // Предустанавливаем кэш
    await redis.set(CACHE_KEY, 'bounce_hard');

    // Настраиваем DB — удалено 1 строка
    db.setupQueryResult('DELETE FROM suppression_list', {
      rows: [],
      rowCount: 1,
    });

    const deleted = await svc.remove(TENANT, EMAIL);

    expect(deleted).toBe(true);

    // Redis кэш должен быть очищен
    const cached = await redis.get(CACHE_KEY);
    expect(cached).toBeNull();

    // DB должен получить DELETE запрос
    const dbQueries = db.queriesMatching('DELETE FROM suppression_list');
    expect(dbQueries.length).toBeGreaterThan(0);
  });

  // ── 8. filterSuppressed() — все suppressed → пустой allowed ──────────────────

  it('8. filterSuppressed() returns empty allowed when all emails are suppressed', async () => {
    const emails = ['a@test.com', 'b@test.com'];

    await redis.set(`supp:${TENANT}:a@test.com`, 'unsubscribe');
    await redis.set(`supp:${TENANT}:b@test.com`, 'manual');

    const { allowed, suppressed } = await svc.filterSuppressed(TENANT, emails);

    expect(allowed).toHaveLength(0);
    expect(suppressed).toHaveLength(2);
  });

  // ── 9. isSuppressed() нормализует email ──────────────────────────────────────

  it('9. isSuppressed() normalizes email to lowercase + trim', async () => {
    // Устанавливаем кэш для нормализованного email
    await redis.set(CACHE_KEY, 'spam_trap');

    // Передаём email в UPPERCASE с пробелами
    const result = await svc.isSuppressed(TENANT, EMAIL_UPPER);

    // Должен найти нормализованную версию
    expect(result).toBe('spam_trap');
  });

  // ── 10. filterSuppressed() с пустым списком ──────────────────────────────────

  it('10. filterSuppressed() returns empty results for empty email list', async () => {
    const { allowed, suppressed } = await svc.filterSuppressed(TENANT, []);

    expect(allowed).toHaveLength(0);
    expect(suppressed).toHaveLength(0);
  });
});
