/**
 * tests/unit/circuitBreaker.test.ts
 *
 * Unit тесты для CircuitBreaker — конечный автомат CLOSED → OPEN → HALF_OPEN.
 * Все тесты используют MockRedis (Map-based, без реального Redis).
 *
 * Покрываемые сценарии:
 *  1. starts in CLOSED state                       — начальное состояние
 *  2. stays CLOSED below threshold                 — не переходит до порога
 *  3. transitions to OPEN after threshold failures — переход CLOSED→OPEN
 *  4. canExecute returns false when OPEN           — блокировка в OPEN
 *  5. transitions to HALF_OPEN after reset timeout — OPEN→HALF_OPEN по таймауту
 *  6. returns to CLOSED after successful HALF_OPEN — HALF_OPEN→CLOSED
 *  7. returns to OPEN on failure in HALF_OPEN      — HALF_OPEN→OPEN при ошибке
 *  8. execute() throws CircuitOpenError when OPEN  — исключение в execute()
 *  9. recordSuccess in CLOSED resets failure count — сброс счётчика
 * 10. execute() succeeds when CLOSED               — успешный вызов
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockRedis } from '../helpers/mocks.spec.js';

// ─── Мокируем logger ────────────────────────────────────────────────────────
vi.mock('../../src/lib/logger.js', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  })),
  createLogger: vi.fn(),
  createRequestLogger: vi.fn(),
}));

// ─── Импорт тестируемого модуля (после моков) ──────────────────────────────
import { CircuitBreaker, CircuitOpenError } from '../../src/lib/circuitBreaker.js';

// ─── Фиксированные параметры ───────────────────────────────────────────────
const CB_NAME = 'smtp-test';
const KEY_STATE = `cb:${CB_NAME}:state`;
const KEY_OPENED_AT = `cb:${CB_NAME}:opened_at`;
const KEY_FAILURES = `cb:${CB_NAME}:failures`;
const KEY_HALF_OPEN = `cb:${CB_NAME}:half_open_count`;

const DEFAULT_OPTS = {
  name: CB_NAME,
  threshold: 3,
  resetTimeoutMs: 5000,
  halfOpenMax: 2,
};

// ─── Тесты ────────────────────────────────────────────────────────────────

describe('CircuitBreaker', () => {
  let redis: MockRedis;

  beforeEach(() => {
    redis = new MockRedis();
    vi.clearAllMocks();
  });

  // ── 1. Начальное состояние ───────────────────────────────────────────────

  it('1. starts in CLOSED state when no state key exists', async () => {
    const cb = new CircuitBreaker(redis as any, DEFAULT_OPTS);

    const state = await cb.getState();

    expect(state).toBe('CLOSED');
  });

  // ── 2. Остаётся CLOSED ниже порога ──────────────────────────────────────

  it('2. stays CLOSED when failure count is below threshold', async () => {
    const cb = new CircuitBreaker(redis as any, DEFAULT_OPTS);

    // threshold = 3, так что 2 ошибки не должны открыть цепь
    await cb.recordFailure();
    await cb.recordFailure();

    const state = await cb.getState();
    expect(state).toBe('CLOSED');
    const canExec = await cb.canExecute();
    expect(canExec).toBe(true);
  });

  // ── 3. Переход в OPEN после порога ──────────────────────────────────────

  it('3. transitions to OPEN after threshold failures', async () => {
    const cb = new CircuitBreaker(redis as any, DEFAULT_OPTS);

    await cb.recordFailure(); // 1
    expect(await cb.getState()).toBe('CLOSED');

    await cb.recordFailure(); // 2
    expect(await cb.getState()).toBe('CLOSED');

    await cb.recordFailure(); // 3 — достигли порога

    expect(await cb.getState()).toBe('OPEN');
  });

  // ── 4. canExecute возвращает false в OPEN ────────────────────────────────

  it('4. canExecute returns false when circuit is OPEN', async () => {
    const cb = new CircuitBreaker(redis as any, DEFAULT_OPTS);

    // Принудительно открываем цепь (установкой ключей напрямую)
    await redis.set(KEY_STATE, 'OPEN');
    await redis.set(KEY_OPENED_AT, Date.now().toString()); // только что открылся

    const canExec = await cb.canExecute();

    expect(canExec).toBe(false);
  });

  // ── 5. Переход в HALF_OPEN после таймаута ────────────────────────────────

  it('5. transitions to HALF_OPEN after resetTimeoutMs has passed', async () => {
    const cb = new CircuitBreaker(redis as any, { ...DEFAULT_OPTS, resetTimeoutMs: 1000 });

    // Устанавливаем OPEN с временем открытия 2 секунды назад
    await redis.set(KEY_STATE, 'OPEN');
    await redis.set(KEY_OPENED_AT, (Date.now() - 2000).toString()); // 2s ago > 1s timeout

    const canExec = await cb.canExecute();

    // canExecute должен был перевести в HALF_OPEN и вернуть true
    expect(canExec).toBe(true);
    const newState = await cb.getState();
    expect(newState).toBe('HALF_OPEN');
  });

  // ── 6. HALF_OPEN → CLOSED после успешных запросов ──────────────────────

  it('6. returns to CLOSED after enough successful requests in HALF_OPEN', async () => {
    const cb = new CircuitBreaker(redis as any, { ...DEFAULT_OPTS, halfOpenMax: 2 });

    // Устанавливаем HALF_OPEN вручную
    await redis.set(KEY_STATE, 'HALF_OPEN');
    await redis.set(KEY_HALF_OPEN, '0');

    // Два успешных запроса → должны вернуть в CLOSED
    await cb.recordSuccess(); // count = 1
    await cb.recordSuccess(); // count = 2 = halfOpenMax → reset → CLOSED

    // После reset() ключ state удаляется → getState() вернёт 'CLOSED' (default)
    const state = await cb.getState();
    expect(state).toBe('CLOSED');
  });

  // ── 7. HALF_OPEN → OPEN при ошибке ──────────────────────────────────────

  it('7. returns to OPEN on failure in HALF_OPEN state', async () => {
    const cb = new CircuitBreaker(redis as any, DEFAULT_OPTS);

    // Устанавливаем HALF_OPEN вручную
    await redis.set(KEY_STATE, 'HALF_OPEN');

    // Одна ошибка в HALF_OPEN → обратно в OPEN
    await cb.recordFailure();

    const state = await cb.getState();
    expect(state).toBe('OPEN');
  });

  // ── 8. execute() выбрасывает CircuitOpenError в OPEN ─────────────────────

  it('8. execute() throws CircuitOpenError when circuit is OPEN', async () => {
    const cb = new CircuitBreaker(redis as any, DEFAULT_OPTS);

    // Открываем цепь (только что — не прошёл timeout)
    await redis.set(KEY_STATE, 'OPEN');
    await redis.set(KEY_OPENED_AT, Date.now().toString());

    const fn = vi.fn(async () => 'should not run');

    await expect(cb.execute(fn)).rejects.toThrow(CircuitOpenError);
    await expect(cb.execute(fn)).rejects.toThrow(`Circuit breaker '${CB_NAME}' is OPEN`);

    // Функция не должна быть вызвана
    expect(fn).not.toHaveBeenCalled();
  });

  // ── 9. recordSuccess в CLOSED сбрасывает счётчик ошибок ──────────────────

  it('9. recordSuccess in CLOSED state decrements failure count', async () => {
    const cb = new CircuitBreaker(redis as any, DEFAULT_OPTS);

    // Накапливаем 2 ошибки (ниже порога)
    await cb.recordFailure(); // failures = 1
    await cb.recordFailure(); // failures = 2

    // Успех должен уменьшить счётчик
    await cb.recordSuccess(); // failures = 1

    const rawFailures = await redis.get(KEY_FAILURES);
    expect(rawFailures).toBe('1');

    // Ещё одна ошибка не должна открыть цепь
    await cb.recordFailure(); // failures = 2 (< threshold=3)
    expect(await cb.getState()).toBe('CLOSED');
  });

  // ── 10. execute() успешно в CLOSED ──────────────────────────────────────

  it('10. execute() calls the function and returns result when CLOSED', async () => {
    const cb = new CircuitBreaker(redis as any, DEFAULT_OPTS);
    const fn = vi.fn(async () => 42);

    const result = await cb.execute(fn);

    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledOnce();
  });

  // ── 11. execute() фиксирует ошибку при сбое функции ─────────────────────

  it('11. execute() records failure and re-throws when function throws', async () => {
    const cb = new CircuitBreaker(redis as any, { ...DEFAULT_OPTS, threshold: 1 });
    const fn = vi.fn(async () => {
      throw new Error('SMTP connection refused');
    });

    await expect(cb.execute(fn)).rejects.toThrow('SMTP connection refused');

    // После одной ошибки при threshold=1 должен быть OPEN
    expect(await cb.getState()).toBe('OPEN');
  });

  // ── 12. reset() возвращает в CLOSED и чистит ключи ──────────────────────

  it('12. reset() clears all state keys and returns circuit to CLOSED', async () => {
    const cb = new CircuitBreaker(redis as any, DEFAULT_OPTS);

    // Открываем цепь
    await redis.set(KEY_STATE, 'OPEN');
    await redis.set(KEY_OPENED_AT, Date.now().toString());
    await redis.set(KEY_FAILURES, '3');

    await cb.reset();

    // Все ключи должны быть удалены
    expect(await redis.get(KEY_STATE)).toBeNull();
    expect(await redis.get(KEY_OPENED_AT)).toBeNull();
    expect(await redis.get(KEY_FAILURES)).toBeNull();
    expect(await redis.get(KEY_HALF_OPEN)).toBeNull();

    // Возвращается в CLOSED
    expect(await cb.getState()).toBe('CLOSED');
  });
});
