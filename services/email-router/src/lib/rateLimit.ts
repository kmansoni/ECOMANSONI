// lib/rateLimit.ts — Per-tenant rate limiting
//
// Three-tier rate limiting:
//   Tier 1: IP-based via express-rate-limit (global anti-DDoS)
//   Tier 2: Tenant-aware Redis sliding window (ZSET with timestamp scores)
//   Tier 3: Global IP warmup daily limit (new sending IP reputation protection)
//
// Warmup strategy (HIGH-4 fix):
//   New sending IPs have no reputation with Gmail/iCloud/Apple.
//   Sending too many emails too quickly causes immediate blacklisting.
//   The warmup limiter enforces a daily cap that grows linearly over 30 days.
//   After IP_LAUNCH_DATE + 30 days, the warmup limit is disabled.
//
//   Schedule:
//     Days  1-3:    50/day
//     Days  4-7:   200/day
//     Days  8-14:  500/day
//     Days 15-21: 1000/day
//     Days 22-30: 2000/day
//     Day  31+:   unlimited (normal limits apply)

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

// ─── Global warmup rate limiter ─────────────────────────────────────────────
// Enforces daily sending cap during IP warmup period (HIGH-4).
// Uses a Redis counter with TTL expiring at midnight UTC.
export class WarmupRateLimiter {
  // Days 1-3: 50, Days 4-7: 200, Days 8-14: 500, Days 15-21: 1000, Days 22-30: 2000
  private static readonly SCHEDULE: Array<{ upToDay: number; limit: number }> = [
    { upToDay: 3,  limit: 50   },
    { upToDay: 7,  limit: 200  },
    { upToDay: 14, limit: 500  },
    { upToDay: 21, limit: 1000 },
    { upToDay: 30, limit: 2000 },
  ];

  constructor(private readonly redis: Redis) {}

  /**
   * Returns the daily limit for the current day of warmup.
   * Returns null if warmup period has ended (day > 30) or WARMUP_ENABLED=false.
   */
  getDailyLimit(launchDateIso: string): number | null {
    const launchTs = new Date(launchDateIso).getTime();
    if (isNaN(launchTs)) return null; // invalid date → no limit

    const daysSinceLaunch = Math.floor((Date.now() - launchTs) / 86_400_000) + 1;
    if (daysSinceLaunch > 30) return null; // warmup period ended

    for (const entry of WarmupRateLimiter.SCHEDULE) {
      if (daysSinceLaunch <= entry.upToDay) return entry.limit;
    }
    return null;
  }

  /**
   * Checks if the global daily warmup limit has been reached.
   * Key is day-scoped: resets automatically at UTC midnight via expiry.
   *
   * Returns { allowed: true } if under limit or warmup is not active.
   * Returns { allowed: false, limit, current } if over limit.
   */
  async check(count: number = 1): Promise<{ allowed: boolean; limit?: number; current?: number }> {
    const env = getEnv();
    if (!env.WARMUP_ENABLED || !env.IP_LAUNCH_DATE) return { allowed: true };

    const dailyLimit = this.getDailyLimit(env.IP_LAUNCH_DATE);
    if (dailyLimit === null) return { allowed: true }; // warmup ended

    // Key scoped to UTC date for automatic daily reset
    const utcDate = new Date().toISOString().slice(0, 10); // "2026-03-26"
    const key = `warmup:daily:${utcDate}`;

    // INCR + EXPIRY in pipeline — atomic for single-threaded Redis
    const pipeline = this.redis.pipeline();
    pipeline.incrby(key, count);
    pipeline.expireat(key, getMidnightUtcUnix());
    const results = await pipeline.exec();

    const current = (results?.[0]?.[1] as number) ?? count;

    if (current > dailyLimit) {
      getLogger().warn({ current, dailyLimit, utcDate }, 'Warmup daily limit reached — email queued for tomorrow');
      return { allowed: false, limit: dailyLimit, current };
    }

    return { allowed: true };
  }
}

/** Returns Unix timestamp for next midnight UTC (for Redis EXPIREAT). */
function getMidnightUtcUnix(): number {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.floor(midnight.getTime() / 1000);
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
