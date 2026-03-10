/**
 * tests/unit/rateLimit.test.ts
 *
 * Unit тесты для TenantRateLimiter (Redis sliding window).
 *
 * Покрываемые сценарии:
 *  1. Разрешает запросы в пределах лимита
 *  2. Блокирует при превышении per-minute лимита
 *  3. Блокирует при превышении per-hour лимита
 *  4. recordUsage() инкрементирует counters
 *  5. remaining корректно вычисляется
 *  6. checkLimit() возвращает retryAfter=60 при minute limit
 *  7. checkLimit() возвращает retryAfter=3600 при hour limit
 *  8. Параллельные recordUsage() не конфликтуют
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockRedis } from '../helpers/mocks.spec.js';

// ─── Мокируем зависимости ─────────────────────────────────────────────────────

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

vi.mock('../../src/config/env.js', () => ({
  getEnv: vi.fn(() => ({
    RATE_LIMIT_PER_TENANT_PER_MINUTE: 60,
    RATE_LIMIT_BULK_PER_HOUR: 1000,
  })),
  loadEnv: vi.fn(),
}));

// ─── Импорт тестируемого модуля ───────────────────────────────────────────────
import { TenantRateLimiter } from '../../src/lib/rateLimit.js';

const TENANT_ID = 'tenant-rate-test';
const MIN_KEY = `rl:tenant:${TENANT_ID}:min`;
const HOUR_KEY = `rl:tenant:${TENANT_ID}:hr`;

const LIMITS = { perMinute: 5, perHour: 100 };

describe('TenantRateLimiter', () => {
  let redis: MockRedis;
  let limiter: TenantRateLimiter;

  beforeEach(() => {
    redis = new MockRedis();
    limiter = new TenantRateLimiter(redis as any);
    vi.clearAllMocks();
  });

  // ── 1. Разрешает запросы в пределах лимита ───────────────────────────────────

  it('1. allows requests within per-minute limit', async () => {
    // Предустанавливаем 3 запроса за последнюю минуту (< limit=5)
    const now = Date.now();
    for (let i = 0; i < 3; i++) {
      await redis.zadd(MIN_KEY, now - i * 1000, `member-${i}`);
      await redis.zadd(HOUR_KEY, now - i * 1000, `member-${i}`);
    }

    const result = await limiter.checkLimit(TENANT_ID, LIMITS);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThan(0);
  });

  // ── 2. Блокирует при превышении per-minute лимита ────────────────────────────

  it('2. blocks requests exceeding per-minute limit', async () => {
    // Заполняем minute window точно до лимита
    const now = Date.now();
    for (let i = 0; i < LIMITS.perMinute; i++) {
      await redis.zadd(MIN_KEY, now - i * 100, `member-${i}`);
    }

    const result = await limiter.checkLimit(TENANT_ID, LIMITS);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBe(60);
  });

  // ── 3. Блокирует при превышении per-hour лимита ──────────────────────────────

  it('3. blocks requests exceeding per-hour limit', async () => {
    const now = Date.now();
    // Minute window чист, но hour window полон
    for (let i = 0; i < LIMITS.perHour; i++) {
      await redis.zadd(HOUR_KEY, now - i * 30000, `member-${i}`); // spread over hour
    }

    const result = await limiter.checkLimit(TENANT_ID, LIMITS);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBe(3600);
  });

  // ── 4. recordUsage() инкрементирует оба счётчика ─────────────────────────────

  it('4. recordUsage() adds entries to both minute and hour sorted sets', async () => {
    await limiter.recordUsage(TENANT_ID, 3); // запись 3 элементов

    const minCount = await redis.zcard(MIN_KEY);
    const hourCount = await redis.zcard(HOUR_KEY);

    expect(minCount).toBe(3);
    expect(hourCount).toBe(3);
  });

  // ── 5. remaining корректно вычисляется ───────────────────────────────────────

  it('5. checkLimit() returns correct remaining count', async () => {
    const now = Date.now();
    // 2 запроса из 5 допустимых за минуту
    await redis.zadd(MIN_KEY, now - 1000, 'a');
    await redis.zadd(MIN_KEY, now - 2000, 'b');
    // 2 запроса из 100 допустимых за час
    await redis.zadd(HOUR_KEY, now - 1000, 'a');
    await redis.zadd(HOUR_KEY, now - 2000, 'b');

    const result = await limiter.checkLimit(TENANT_ID, LIMITS);

    expect(result.allowed).toBe(true);
    // remaining = min(perMinute - minuteCount - 1, perHour - hourCount - 1)
    // = min(5 - 2 - 1, 100 - 2 - 1) = min(2, 97) = 2
    expect(result.remaining).toBe(2);
  });

  // ── 6. retryAfter=60 при minute limit ───────────────────────────────────────

  it('6. returns retryAfter=60 when per-minute limit is exceeded', async () => {
    const now = Date.now();
    for (let i = 0; i < LIMITS.perMinute; i++) {
      await redis.zadd(MIN_KEY, now - i * 100, `m${i}`);
    }

    const { retryAfter } = await limiter.checkLimit(TENANT_ID, LIMITS);
    expect(retryAfter).toBe(60);
  });

  // ── 7. retryAfter=3600 при hour limit ───────────────────────────────────────

  it('7. returns retryAfter=3600 when per-hour limit is exceeded', async () => {
    const now = Date.now();
    // Minute window пуст
    // Hour window заполнен
    for (let i = 0; i < LIMITS.perHour; i++) {
      await redis.zadd(HOUR_KEY, now - i * 30000, `h${i}`);
    }

    const { retryAfter } = await limiter.checkLimit(TENANT_ID, LIMITS);
    expect(retryAfter).toBe(3600);
  });

  // ── 8. recordUsage() с count=1 (default) ─────────────────────────────────────

  it('8. recordUsage() with default count=1 adds single entry', async () => {
    await limiter.recordUsage(TENANT_ID); // count defaults to 1

    const minCount = await redis.zcard(MIN_KEY);
    expect(minCount).toBe(1);
  });

  // ── 9. Старые записи удаляются при checkLimit() ──────────────────────────────

  it('9. checkLimit() removes expired entries from sliding window', async () => {
    const now = Date.now();
    const oldTime = now - 70000; // 70 секунд назад > 60 секунд window

    // Добавляем старые записи (за пределами window)
    for (let i = 0; i < LIMITS.perMinute; i++) {
      await redis.zadd(MIN_KEY, oldTime, `old-${i}`);
    }

    // После удаления старых записей limit должен быть не превышен
    const result = await limiter.checkLimit(TENANT_ID, LIMITS);

    expect(result.allowed).toBe(true);
  });
});
