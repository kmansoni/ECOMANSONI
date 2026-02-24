/**
 * Rate Limiter Service
 * 
 * Implements token bucket rate limiting with Redis for fast, distributed state.
 * Falls back to simple DB tracking if Redis unavailable.
 * 
 * Architecture:
 * 1. Redis tokens: fast, distributed, embargoes handled with TTL
 * 2. DB audit log: every decision logged for compliance + analytics
 * 3. Graceful degradation: if Redis down, use DB limits (slower but works)
 */

import { createClient } from '@supabase/supabase-js';
import * as Redis from 'ioredis';
import type {
  ActorType,
  RiskTier,
  RateLimitDecision,
} from './types';

export interface RateLimitConfig {
  algo: 'token_bucket' | 'fixed_window' | 'sliding_window';
  limit_value: number; // Tokens per window
  window_seconds: number;
  burst?: number; // Max tokens to accumulate (token bucket only)
}

export class RateLimiter {
  private supabase: any;
  private redis: Redis.Redis | null;
  private redisEnabled: boolean;
  private readonly REDIS_PREFIX = 'rate_limit:';

  constructor(
    supabaseUrl: string,
    supabaseServiceRoleKey: string,
    redisUrl?: string
  ) {
    this.supabase = createClient(
      supabaseUrl,
      supabaseServiceRoleKey,
      {
        auth: { persistSession: false },
      }
    );

    if (redisUrl) {
      try {
        this.redis = new Redis(redisUrl);
        this.redis.on('error', (err) => {
          console.warn('[RateLimiter] Redis connection error:', err.message);
          this.redisEnabled = false;
        });
        this.redis.on('connect', () => {
          console.log('[RateLimiter] Redis connected');
          this.redisEnabled = true;
        });
        this.redisEnabled = true;
      } catch (err) {
        console.warn('[RateLimiter] Failed to initialize Redis:', err);
        this.redis = null;
        this.redisEnabled = false;
      }
    } else {
      this.redis = null;
      this.redisEnabled = false;
    }
  }

  /**
   * Check and consume rate limit for an action
   * Returns decision + remaining tokens
   */
  async checkAndConsume(
    actorType: ActorType,
    actorId: string,
    action: string,
    config: RateLimitConfig,
    costPerAction: number = 1,
    requestId?: string
  ): Promise<RateLimitDecision> {
    try {
      // Hard deny if limit is 0
      if (config.limit_value === 0) {
        await this.logAudit(
          actorType,
          actorId,
          action,
          0,
          costPerAction,
          false,
          0,
          requestId
        );
        return {
          allowed: false,
          tokens_available: 0,
          tokens_required: costPerAction,
          reset_at: new Date(
            Date.now() + config.window_seconds * 1000
          ).toISOString(),
          wait_ms: config.window_seconds * 1000,
        };
      }

      // Attempt Redis first (if enabled)
      if (this.redisEnabled && this.redis) {
        try {
          return await this.checkAndConsumeRedis(
            actorType,
            actorId,
            action,
            config,
            costPerAction,
            requestId
          );
        } catch (err) {
          console.warn('[RateLimiter] Redis check failed, falling back to DB:', err);
          this.redisEnabled = false;
        }
      }

      // Fallback: simple DB check
      return await this.checkAndConsumeDB(
        actorType,
        actorId,
        action,
        config,
        costPerAction,
        requestId
      );
    } catch (err) {
      console.error('[RateLimiter] Error checking rate limit:', err);
      // Fail open: allow on error
      return {
        allowed: true,
        tokens_available: config.limit_value,
        tokens_required: costPerAction,
      };
    }
  }

  /**
   * Token bucket implementation in Redis
   * 
   * State tracking:
   * - `{prefix}:{action}:{actor}:tokens` → current tokens (float)
   * - `{prefix}:{action}:{actor}:ts` → last refill timestamp (unix seconds)
   */
  private async checkAndConsumeRedis(
    actorType: ActorType,
    actorId: string,
    action: string,
    config: RateLimitConfig,
    costPerAction: number,
    requestId?: string
  ): Promise<RateLimitDecision> {
    const key = `${this.REDIS_PREFIX}${action}:${actorType}:${actorId}`;
    const tokensKey = `${key}:tokens`;
    const tsKey = `${key}:ts`;

    // Use Redis EVALSHA or Lua script for atomic operation
    // For simplicity: fetch, compute, set (note: race condition possible)
    const [tokensStr, lastTsStr] = await Promise.all([
      this.redis!.get(tokensKey),
      this.redis!.get(tsKey),
    ]);

    const now = Date.now() / 1000; // unix seconds
    const lastTs = lastTsStr ? parseFloat(lastTsStr) : now;
    const elapsedSecs = now - lastTs;

    // Compute refilled tokens
    const refillRate = config.limit_value / config.window_seconds;
    const refilled = elapsedSecs * refillRate;
    const currentTokens = Math.min(
      (tokensStr ? parseFloat(tokensStr) : config.limit_value) + refilled,
      config.burst || config.limit_value
    );

    const allowed = currentTokens >= costPerAction;
    const newTokens = allowed ? currentTokens - costPerAction : currentTokens;
    const remaining = Math.floor(newTokens);

    // Update state with TTL window
    await Promise.all([
      this.redis!.setex(tokensKey, config.window_seconds, newTokens.toString()),
      this.redis!.setex(tsKey, config.window_seconds, now.toString()),
    ]);

    const resetAt = new Date(
      (lastTs + config.window_seconds) * 1000
    ).toISOString();
    const waitMs = allowed
      ? 0
      : Math.ceil(
          ((costPerAction - newTokens) / refillRate) * 1000
        );

    await this.logAudit(
      actorType,
      actorId,
      action,
      Math.floor(currentTokens),
      costPerAction,
      allowed,
      remaining,
      requestId,
      resetAt
    );

    return {
      allowed,
      tokens_available: remaining,
      tokens_required: costPerAction,
      reset_at: resetAt,
      wait_ms: waitMs,
    };
  }

  /**
   * Fallback: DB-based rate limit check
   * Simpler but slower; doesn't actually consume tokens (just logs)
   */
  private async checkAndConsumeDB(
    actorType: ActorType,
    actorId: string,
    action: string,
    config: RateLimitConfig,
    costPerAction: number,
    requestId?: string
  ): Promise<RateLimitDecision> {
    // Simple approach: count events in recent window
    const since = new Date(Date.now() - config.window_seconds * 1000).toISOString();

    const { count } = await this.supabase
      .from('rate_limit_audits')
      .select('*', { count: 'exact', head: true })
      .eq('actor_type', actorType)
      .eq('actor_id', actorId)
      .eq('action', action)
      .eq('allowed', true) // Only count successful operations
      .gte('ts', since);

    const estimatedTokens = config.limit_value; // Simplified
    const used = (count || 0) * costPerAction;
    const allowed = used < config.limit_value;
    const remaining = Math.max(0, config.limit_value - used);

    const resetAt = new Date(
      Date.now() + config.window_seconds * 1000
    ).toISOString();

    await this.logAudit(
      actorType,
      actorId,
      action,
      estimatedTokens,
      costPerAction,
      allowed,
      remaining,
      requestId,
      resetAt
    );

    return {
      allowed,
      tokens_available: remaining,
      tokens_required: costPerAction,
      reset_at: resetAt,
      wait_ms: allowed ? 0 : config.window_seconds * 1000,
    };
  }

  /**
   * Log rate limit decision for audit + analytics
   */
  private async logAudit(
    actorType: ActorType,
    actorId: string,
    action: string,
    tokensAvailable: number,
    tokensRequired: number,
    allowed: boolean,
    remainingTokens: number,
    requestId?: string,
    resetAt?: string
  ): Promise<void> {
    try {
      await this.supabase.from('rate_limit_audits').insert({
        actor_type: actorType,
        actor_id: actorId,
        action,
        tokens_available: tokensAvailable,
        tokens_required: tokensRequired,
        allowed,
        remaining_tokens: remainingTokens,
        reset_at: resetAt,
        request_id: requestId,
        ts: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[RateLimiter] Error logging audit:', err);
      // Don't fail the rate limit check for audit errors
    }
  }

  /**
   * Reset tokens for an actor (manual intervention)
   */
  async reset(actorType: ActorType, actorId: string, action?: string): Promise<void> {
    if (!this.redisEnabled || !this.redis) {
      console.warn('[RateLimiter] Redis not available, cannot reset');
      return;
    }

    const pattern = action
      ? `${this.REDIS_PREFIX}${action}:${actorType}:${actorId}:*`
      : `${this.REDIS_PREFIX}*:${actorType}:${actorId}:*`;

    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
      console.log(`[RateLimiter] Reset ${keys.length} limit keys for ${actorType}:${actorId}`);
    }
  }

  /**
   * Graceful shutdown
   */
  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      console.log('[RateLimiter] Redis connection closed');
    }
  }
}

/**
 * Singleton instance
 */
let rateLimiterInstance: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (!rateLimiterInstance) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const redisUrl = process.env.REDIS_URL;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Missing Supabase credentials for RateLimiter');
    }

    rateLimiterInstance = new RateLimiter(
      supabaseUrl,
      supabaseServiceRoleKey,
      redisUrl
    );
  }

  return rateLimiterInstance;
}
