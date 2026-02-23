/**
 * Rate Limiting Service - v2.8 Platform Core
 * 
 * Uses Redis token bucket algorithm
 * Four dimensions: actor_id, device_id, service_id, delegated_user_id
 * 
 * Section 9: Rate limits per scope, per actor global, per device
 * G-QRY-01: Timeline caps enforced
 * 
 * Limits configured in registry (schema/registry/types.ts)
 */

import Redis from "ioredis";
import { getConstant } from "@/lib/registry/loader";

export interface RateLimitKey {
  actor_id?: string;
  device_id?: string;
  service_id?: string;
  delegated_user_id?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  tokens_remaining: number;
  reset_at_s: number;
  retry_after_ms: number;
}

/**
 * Rate limiter using Redis token bucket
 */
export class RateLimiter {
  private redis: Redis;
  private window_s = 60; // 1 minute window

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Build rate limit key
   * Format: rl:{operation}:{dim}={value}
   */
  private buildKey(operation: string, dimension: string, value: string): string {
    return `rl:${operation}:${dimension}=${value}`;
  }

  /**
   * Check rate limit for operation + key
   * Token bucket algorithm:
   *   - Tokens add over time (refill rate)
   *   - Each operation costs 1 token
   *   - If tokens > 0, allow; decrement token count
   */
  async checkLimit(
    operation: string,
    limit: number,
    key: RateLimitKey
  ): Promise<RateLimitResult> {
    const entries = Object.entries(key).filter(([_, v]) => v);
    if (entries.length === 0) {
      throw new Error("RateLimitKey must have at least one dimension");
    }

    // Use first dimension for this check (could aggregate multiple)
    const [dim, value] = entries[0];
    const redisKey = this.buildKey(operation, dim, value);

    const now = Math.floor(Date.now() / 1000);
    const resetAt = now + this.window_s;

    // Lua script for atomic token bucket operation
    // Returns: [allowed, tokens_remaining, reset_at]
    const luaScript = `
      local key = KEYS[1]
      local limit = tonumber(ARGV[1])
      local window = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])
      
      local current = redis.call('GET', key)
      local tokens = limit  -- Start with full bucket
      
      if current then
        local last_refill = redis.call('GET', key .. ':last_refill') or now
        last_refill = tonumber(last_refill)
        
        -- Refill tokens based on elapsed time
        local elapsed = now - last_refill
        local refill_tokens = math.min(limit, math.floor(elapsed / window * limit))
        tokens = math.min(limit, tonumber(current) + refill_tokens)
      end
      
      -- Try to consume 1 token
      local allowed = tokens > 0
      if allowed then
        tokens = tokens - 1
      end
      
      -- Save state
      redis.call('SET', key, tokens, 'EX', window)
      redis.call('SET', key .. ':last_refill', now, 'EX', window)
      
      return {allowed, tokens, now + window}
    `;

    try {
      const result = await this.redis.eval(luaScript, 1, redisKey, limit, this.window_s, now);
      const [allowed, tokensRemaining, resetAtTs] = result as [number, number, number];

      return {
        allowed: allowed === 1,
        tokens_remaining: tokensRemaining,
        reset_at_s: resetAtTs,
        retry_after_ms: Math.max(0, (resetAtTs - now) * 1000),
      };
    } catch (error) {
      console.error(`Rate limit check failed for ${redisKey}:`, error);
      // Fail open on Redis error (allow request but log)
      return {
        allowed: true,
        tokens_remaining: limit,
        reset_at_s: resetAt,
        retry_after_ms: 0,
      };
    }
  }

  /**
   * Check timeline query rate limit
   * Enforces: per-scope, per-actor global, per-device
   */
  async checkTimelineLimit(
    scopeId: string,
    actorId: string,
    deviceId?: string
  ): Promise<RateLimitResult> {
    const limits = {
      timeline_per_scope: getConstant("RATE_LIMIT_CONFIG").timeline_per_scope,
      timeline_per_actor_global: getConstant("RATE_LIMIT_CONFIG").timeline_per_actor_global,
      timeline_per_device: getConstant("RATE_LIMIT_CONFIG").timeline_per_device,
    };

    // Check per-scope limit
    let result = await this.checkLimit("timeline_per_scope", limits.timeline_per_scope, {
      actor_id: actorId,
      device_id: scopeId, // reuse dimension for scope
    });

    if (!result.allowed) {
      return result;
    }

    // Check per-actor global limit
    result = await this.checkLimit("timeline_per_actor_global", limits.timeline_per_actor_global, {
      actor_id: actorId,
    });

    if (!result.allowed) {
      return result;
    }

    // Check per-device limit (if provided)
    if (deviceId) {
      result = await this.checkLimit("timeline_per_device", limits.timeline_per_device, {
        device_id: deviceId,
      });
    }

    return result;
  }

  /**
   * Check /cmd rate limit
   * Enforces: per-actor, per-device, per-service
   */
  async checkCmdLimit(actorId: string, deviceId?: string, serviceId?: string): Promise<RateLimitResult> {
    const limits = {
      cmd_per_actor: getConstant("RATE_LIMIT_CONFIG").cmd_per_actor,
      cmd_per_device: getConstant("RATE_LIMIT_CONFIG").cmd_per_device,
      cmd_per_service: getConstant("RATE_LIMIT_CONFIG").cmd_per_service,
    };

    // Check per-actor limit
    let result = await this.checkLimit("cmd_per_actor", limits.cmd_per_actor, {
      actor_id: actorId,
    });

    if (!result.allowed) {
      return result;
    }

    // Check per-device limit
    if (deviceId) {
      result = await this.checkLimit("cmd_per_device", limits.cmd_per_device, {
        device_id: deviceId,
      });

      if (!result.allowed) {
        return result;
      }
    }

    // Check per-service limit
    if (serviceId) {
      result = await this.checkLimit("cmd_per_service", limits.cmd_per_service, {
        service_id: serviceId,
      });
    }

    return result;
  }

  /**
   * Check maintenance transition rate limit
   * Max 3 per hour (INV-MAINT-01)
   */
  async checkMaintenanceLimit(actorId: string): Promise<RateLimitResult> {
    const limit = getConstant("RATE_LIMIT_CONFIG").maintenance_per_hour;
    const hoursWindow = 3600; // 1 hour in seconds

    const luaScript = `
      local key = KEYS[1]
      local limit = tonumber(ARGV[1])
      local now = tonumber(ARGV[2])
      
      local current = redis.call('GET', key) or 0
      current = tonumber(current)
      
      -- Set TTL to 1 hour
      if current >= limit then
        return {0, 0, now + 3600}
      end
      
      -- Increment counter
      redis.call('INCR', key)
      redis.call('EXPIRE', key, 3600)
      
      return {1, limit - current - 1, now + 3600}
    `;

    const redisKey = `rl:maintenance_transition:actor=${actorId}`;
    const now = Math.floor(Date.now() / 1000);

    try {
      const result = await this.redis.eval(luaScript, 1, redisKey, limit, now);
      const [allowed, remaining, resetAtTs] = result as [number, number, number];

      return {
        allowed: allowed === 1,
        tokens_remaining: remaining,
        reset_at_s: resetAtTs,
        retry_after_ms: Math.max(0, (resetAtTs - now) * 1000),
      };
    } catch (error) {
      console.error(`Maintenance rate limit check failed:`, error);
      return {
        allowed: true,
        tokens_remaining: limit,
        reset_at_s: now + hoursWindow,
        retry_after_ms: 0,
      };
    }
  }

  /**
   * Reset rate limit for a specific key (admin)
   */
  async reset(operation: string, dimension: string, value: string): Promise<void> {
    const redisKey = this.buildKey(operation, dimension, value);
    await this.redis.del(redisKey, `${redisKey}:last_refill`);
  }

  /**
   * Get current token count (diagnostic)
   */
  async getTokens(operation: string, dimension: string, value: string): Promise<number> {
    const redisKey = this.buildKey(operation, dimension, value);
    const current = await this.redis.get(redisKey);
    return current ? parseInt(current, 10) : 0;
  }
}

/**
 * Factory for creating rate limiter
 */
export function createRateLimiter(redisUrl?: string): RateLimiter {
  const redis = new Redis(redisUrl || process.env.REDIS_URL || "redis://localhost:6379");
  return new RateLimiter(redis);
}

/**
 * Middleware for Express/Node.js
 * Checks rate limit and returns 429 if exceeded
 */
export function rateLimitMiddleware(limiter: RateLimiter, operation: string) {
  return async (req: any, res: any, next: any) => {
    const actorId = req.user?.id || req.headers["x-actor-id"];
    const deviceId = req.headers["x-device-id"];
    const serviceId = req.headers["x-service-id"];

    if (!actorId) {
      return res.status(401).json({ error: "Missing actor_id" });
    }

    let result: RateLimitResult;

    if (operation === "timeline") {
      const scopeId = req.query.scope_id;
      result = await limiter.checkTimelineLimit(scopeId, actorId, deviceId as string);
    } else if (operation === "cmd") {
      result = await limiter.checkCmdLimit(actorId, deviceId as string, serviceId as string);
    } else {
      result = await limiter.checkLimit(operation, 100, { actor_id: actorId });
    }

    // Set headers
    res.set("X-RateLimit-Remaining", String(result.tokens_remaining));
    res.set("X-RateLimit-Reset", String(result.reset_at_s));

    if (!result.allowed) {
      return res.status(429).json({
        error: "rate_limit_exceeded",
        retry_after_ms: result.retry_after_ms,
      });
    }

    next();
  };
}
