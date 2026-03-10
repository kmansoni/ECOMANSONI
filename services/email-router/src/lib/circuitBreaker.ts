// lib/circuitBreaker.ts — Circuit breaker for SMTP connections
//
// State machine: CLOSED → OPEN → HALF_OPEN
// State stored in Redis for cross-instance consistency.
// Atomic transitions via pipeline; per-circuit-name isolation.

import { Redis } from 'ioredis';
import { getLogger } from './logger.js';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  name: string;
  threshold: number; // Количество ошибок для открытия
  resetTimeoutMs: number; // Время до перехода OPEN → HALF_OPEN
  halfOpenMax: number; // Max запросов в HALF_OPEN
}

export class CircuitBreaker {
  private readonly keyPrefix: string;

  constructor(
    private readonly redis: Redis,
    private readonly options: CircuitBreakerOptions,
  ) {
    this.keyPrefix = `cb:${options.name}`;
  }

  async getState(): Promise<CircuitState> {
    const state = await this.redis.get(`${this.keyPrefix}:state`);
    return (state as CircuitState) || 'CLOSED';
  }

  /**
   * Проверяет, можно ли выполнить запрос.
   * Возвращает true если circuit позволяет.
   */
  async canExecute(): Promise<boolean> {
    const state = await this.getState();
    const logger = getLogger();

    switch (state) {
      case 'CLOSED':
        return true;

      case 'OPEN': {
        // Проверяем, прошёл ли resetTimeout
        const openedAt = await this.redis.get(`${this.keyPrefix}:opened_at`);
        if (openedAt && Date.now() - parseInt(openedAt, 10) >= this.options.resetTimeoutMs) {
          // Переходим в HALF_OPEN
          await this.redis.set(`${this.keyPrefix}:state`, 'HALF_OPEN');
          await this.redis.set(`${this.keyPrefix}:half_open_count`, '0');
          logger.info({ circuit: this.options.name }, 'Circuit breaker → HALF_OPEN');
          return true;
        }
        return false;
      }

      case 'HALF_OPEN': {
        const count = parseInt((await this.redis.get(`${this.keyPrefix}:half_open_count`)) || '0', 10);
        return count < this.options.halfOpenMax;
      }

      default:
        return true;
    }
  }

  /**
   * Записывает успех.
   */
  async recordSuccess(): Promise<void> {
    const state = await this.getState();
    const logger = getLogger();

    if (state === 'HALF_OPEN') {
      const count = await this.redis.incr(`${this.keyPrefix}:half_open_count`);
      if (count >= this.options.halfOpenMax) {
        // Все пробные запросы успешны → CLOSED
        await this.reset();
        logger.info({ circuit: this.options.name }, 'Circuit breaker → CLOSED (recovered)');
      }
    } else if (state === 'CLOSED') {
      // Уменьшаем счётчик ошибок при успехе
      await this.redis.decr(`${this.keyPrefix}:failures`);
      const failures = parseInt((await this.redis.get(`${this.keyPrefix}:failures`)) || '0', 10);
      if (failures < 0) {
        await this.redis.set(`${this.keyPrefix}:failures`, '0');
      }
    }
  }

  /**
   * Записывает ошибку.
   */
  async recordFailure(): Promise<void> {
    const state = await this.getState();
    const logger = getLogger();

    if (state === 'HALF_OPEN') {
      // Одна ошибка в half-open → обратно в OPEN
      await this.trip();
      logger.warn({ circuit: this.options.name }, 'Circuit breaker → OPEN (half-open failure)');
      return;
    }

    // CLOSED: инкрементируем ошибки
    const failures = await this.redis.incr(`${this.keyPrefix}:failures`);
    await this.redis.expire(`${this.keyPrefix}:failures`, Math.ceil(this.options.resetTimeoutMs / 1000) * 2);

    if (failures >= this.options.threshold) {
      await this.trip();
      logger.warn(
        { circuit: this.options.name, failures, threshold: this.options.threshold },
        'Circuit breaker → OPEN',
      );
    }
  }

  /**
   * Открывает circuit (trip)
   */
  private async trip(): Promise<void> {
    const ttl = Math.ceil(this.options.resetTimeoutMs / 1000) * 3;
    const pipeline = this.redis.pipeline();
    pipeline.set(`${this.keyPrefix}:state`, 'OPEN');
    pipeline.set(`${this.keyPrefix}:opened_at`, Date.now().toString());
    pipeline.set(`${this.keyPrefix}:failures`, '0');
    pipeline.expire(`${this.keyPrefix}:state`, ttl);
    pipeline.expire(`${this.keyPrefix}:opened_at`, ttl);
    await pipeline.exec();
  }

  /**
   * Сбрасывает circuit в CLOSED
   */
  async reset(): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.del(`${this.keyPrefix}:state`);
    pipeline.del(`${this.keyPrefix}:opened_at`);
    pipeline.del(`${this.keyPrefix}:failures`);
    pipeline.del(`${this.keyPrefix}:half_open_count`);
    await pipeline.exec();
  }

  /**
   * Выполняет функцию через circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const canExec = await this.canExecute();
    if (!canExec) {
      throw new CircuitOpenError(this.options.name);
    }

    try {
      const result = await fn();
      await this.recordSuccess();
      return result;
    } catch (error) {
      await this.recordFailure();
      throw error;
    }
  }
}

export class CircuitOpenError extends Error {
  constructor(circuitName: string) {
    super(`Circuit breaker '${circuitName}' is OPEN — request rejected`);
    this.name = 'CircuitOpenError';
  }
}
