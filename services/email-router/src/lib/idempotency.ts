// lib/idempotency.ts — Idempotency key enforcement
//
// Two-tier check: Redis (fast) → PostgreSQL (durable).
// Ensures at-most-once delivery semantics for email send requests.
// TTL-based expiry: keys valid for 24 hours (configurable).

import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { getLogger } from './logger.js';

export interface IdempotencyResult {
  isDuplicate: boolean;
  existingMessageId?: string;
  existingStatus?: string;
}

export class IdempotencyService {
  constructor(
    private readonly db: Pool,
    private readonly redis: Redis,
    private readonly ttlSeconds: number = 86400, // 24 hours
  ) {}

  /**
   * Проверяет идемпотентность: сначала Redis (быстро), потом PG (надёжно).
   * Возвращает isDuplicate=true если запрос уже обработан.
   */
  async check(tenantId: string, idempotencyKey: string): Promise<IdempotencyResult> {
    const logger = getLogger();
    const cacheKey = `idem:${tenantId}:${idempotencyKey}`;

    // 1. Быстрая проверка в Redis
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const data = JSON.parse(cached) as { messageId: string; status: string };
      logger.debug({ tenantId, idempotencyKey, messageId: data.messageId }, 'Idempotency hit (Redis)');
      return { isDuplicate: true, existingMessageId: data.messageId, existingStatus: data.status };
    }

    // 2. Проверка в PostgreSQL (fallback)
    const result = await this.db.query<{ id: string; status: string }>(
      `SELECT id, status FROM email_messages WHERE tenant_id = $1 AND idempotency_key = $2`,
      [tenantId, idempotencyKey],
    );

    if (result.rows.length > 0) {
      const row = result.rows[0]!;
      // Записать в Redis для следующих запросов
      await this.redis.setex(
        cacheKey,
        this.ttlSeconds,
        JSON.stringify({
          messageId: row.id,
          status: row.status,
        }),
      );
      logger.debug({ tenantId, idempotencyKey, messageId: row.id }, 'Idempotency hit (PG)');
      return { isDuplicate: true, existingMessageId: row.id, existingStatus: row.status };
    }

    return { isDuplicate: false };
  }

  /**
   * Регистрирует новый запрос в Redis (PG запись происходит при вставке message)
   */
  async register(tenantId: string, idempotencyKey: string, messageId: string, status: string): Promise<void> {
    const cacheKey = `idem:${tenantId}:${idempotencyKey}`;
    await this.redis.setex(cacheKey, this.ttlSeconds, JSON.stringify({ messageId, status }));
  }

  /**
   * Обновляет статус в кеше
   */
  async updateStatus(
    tenantId: string,
    idempotencyKey: string,
    messageId: string,
    status: string,
  ): Promise<void> {
    const cacheKey = `idem:${tenantId}:${idempotencyKey}`;
    const exists = await this.redis.exists(cacheKey);
    if (exists) {
      await this.redis.setex(cacheKey, this.ttlSeconds, JSON.stringify({ messageId, status }));
    }
  }
}
