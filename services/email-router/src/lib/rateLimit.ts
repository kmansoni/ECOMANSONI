// lib/rateLimit.ts — Per-tenant rate limiting
//
// Two-tier rate limiting:
//   Tier 1: IP-based via express-rate-limit (global anti-DDoS)
//   Tier 2: Tenant-aware Redis sliding window (ZSET with timestamp scores)

import rateLimit from 'express-rate-limit';
import { Redis } from 'ioredis';
import { Request, Response, NextFunction } from 'express';
import { getEnv } from '../config/env.js';
import { getLogger } from './logger.js';

// ─── IP-based rate limit (global) ─────────────────────
export function createIPRateLimit() {
  return rateLimit({
    windowMs: 60 * 1000, // 1 минута
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => req.ip || 'unknown',
    handler: (_req: Request, res: Response) => {
      res.status(429).json({
        error: 'RATE_LIMITED',
        message: 'Too many requests from this IP',
        requestId: (_req as Request).requestId,
        retryAfter: Math.ceil(60),
      });
    },
  });
}

// ─── Tenant-based rate limit (per-tenant sliding window in Redis) ─────
export class TenantRateLimiter {
  constructor(private readonly redis: Redis) {}

  /**
   * Sliding window rate limit per tenant.
   * Использует Redis ZSET с timestamp scores.
   */
  async checkLimit(
    tenantId: string,
    limits: { perMinute: number; perHour: number },
  ): Promise<{ allowed: boolean; remaining: number; retryAfter?: number }> {
    const logger = getLogger();
    const now = Date.now();
    const minuteKey = `rl:tenant:${tenantId}:min`;
    const hourKey = `rl:tenant:${tenantId}:hr`;

    const pipeline = this.redis.pipeline();

    // Очистка устаревших записей + подсчёт текущих
    // Per-minute window
    pipeline.zremrangebyscore(minuteKey, 0, now - 60000);
    pipeline.zcard(minuteKey);
    // Per-hour window
    pipeline.zremrangebyscore(hourKey, 0, now - 3600000);
    pipeline.zcard(hourKey);

    const results = await pipeline.exec();
    if (!results) throw new Error('Redis pipeline failed');

    const minuteCount = (results[1]?.[1] as number) || 0;
    const hourCount = (results[3]?.[1] as number) || 0;

    // Проверка minute limit
    if (minuteCount >= limits.perMinute) {
      logger.warn({ tenantId, minuteCount, limit: limits.perMinute }, 'Tenant rate limit exceeded (minute)');
      return { allowed: false, remaining: 0, retryAfter: 60 };
    }

    // Проверка hour limit
    if (hourCount >= limits.perHour) {
      logger.warn({ tenantId, hourCount, limit: limits.perHour }, 'Tenant rate limit exceeded (hour)');
      return { allowed: false, remaining: 0, retryAfter: 3600 };
    }

    return {
      allowed: true,
      remaining: Math.min(limits.perMinute - minuteCount - 1, limits.perHour - hourCount - 1),
    };
  }

  /**
   * Записывает использование после успешной обработки запроса.
   */
  async recordUsage(tenantId: string, count: number = 1): Promise<void> {
    const now = Date.now();
    const minuteKey = `rl:tenant:${tenantId}:min`;
    const hourKey = `rl:tenant:${tenantId}:hr`;
    const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;

    const pipeline = this.redis.pipeline();
    for (let i = 0; i < count; i++) {
      const uniqueMember = `${member}:${i}`;
      pipeline.zadd(minuteKey, now, uniqueMember);
      pipeline.zadd(hourKey, now, uniqueMember);
    }
    pipeline.expire(minuteKey, 120);
    pipeline.expire(hourKey, 7200);
    await pipeline.exec();
  }
}

// ─── Express middleware для tenant rate limiting ─────
export function tenantRateLimitMiddleware(rateLimiter: TenantRateLimiter) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.auth) {
      next();
      return;
    }

    const env = getEnv();
    const limits = {
      perMinute: env.RATE_LIMIT_PER_TENANT_PER_MINUTE,
      perHour: env.RATE_LIMIT_BULK_PER_HOUR,
    };

    const result = await rateLimiter.checkLimit(req.auth.tenantId, limits);

    // Установка заголовков
    res.setHeader('X-RateLimit-Remaining', result.remaining);

    if (!result.allowed) {
      res.setHeader('Retry-After', result.retryAfter || 60);
      res.status(429).json({
        error: 'RATE_LIMITED',
        message: 'Tenant rate limit exceeded',
        retryAfter: result.retryAfter,
        requestId: req.requestId,
      });
      return;
    }

    next();
  };
}
