/**
 * Rate Limiting Service - v2.8 Platform Core (Browser-Safe)
 *
 * In-memory token bucket algorithm — no Redis dependency.
 * Designed for client-side UI spam protection.
 * Real enforcement MUST happen server-side (Edge Functions / API middleware).
 *
 * Four dimensions: actor_id, device_id, service_id, delegated_user_id
 *
 * Section 9: Rate limits per scope, per actor global, per device
 * G-QRY-01: Timeline caps enforced
 *
 * Implementation notes:
 * - Lazy refill: tokens are computed on access, not on timers per bucket
 * - Periodic GC sweep removes expired entries (prevents memory leak)
 * - Max entries cap prevents OOM under adversarial conditions
 * - Single-threaded JS guarantees no race conditions within a tab
 */

// ---------------------------------------------------------------------------
// Default rate limit config (mirrors schemas/registry/types.ts RATE_LIMIT_CONFIG)
// Inlined to avoid importing Node.js-only registry loader
// ---------------------------------------------------------------------------
const DEFAULT_RATE_LIMIT_CONFIG = {
  timeline_per_scope: 100,
  timeline_per_actor_global: 500,
  timeline_per_device: 150,
  timeline_per_service: 1000,
  cmd_per_actor: 200,
  cmd_per_device: 100,
  cmd_per_service: 2000,
  maintenance_per_hour: 3,
} as const;

export type RateLimitConfig = typeof DEFAULT_RATE_LIMIT_CONFIG;

// ---------------------------------------------------------------------------
// Public types — unchanged API surface
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Internal bucket state
// ---------------------------------------------------------------------------

interface BucketState {
  /** Current token count (may be stale — recomputed on access via lazy refill) */
  tokens: number;
  /** Unix seconds of last refill computation */
  lastRefillS: number;
  /** Unix seconds when this entry expires and can be GC'd */
  expiresAtS: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum distinct keys before forced eviction (OOM protection) */
const MAX_BUCKET_ENTRIES = 50_000;

/** GC sweep interval in milliseconds */
const GC_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// RateLimiter — browser-safe, in-memory token bucket
// ---------------------------------------------------------------------------

/**
 * Rate limiter using in-memory token bucket.
 *
 * ⚠️  This is client-side protection only. A malicious client can bypass it.
 *     Server-side enforcement via Supabase RLS / Edge Functions is mandatory.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, BucketState>();
  private readonly windowS: number;
  private readonly config: RateLimitConfig;
  private gcTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<RateLimitConfig>, windowS = 60) {
    this.windowS = windowS;
    this.config = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config };
    this.startGC();
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Stop the GC timer. Call when disposing the limiter. */
  dispose(): void {
    if (this.gcTimer !== null) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
    this.buckets.clear();
  }

  // -------------------------------------------------------------------------
  // Core: check limit
  // -------------------------------------------------------------------------

  /**
   * Build rate limit key.
   * Format: rl:{operation}:{dim}={value}
   */
  private buildKey(operation: string, dimension: string, value: string): string {
    return `rl:${operation}:${dimension}=${value}`;
  }

  /**
   * Check rate limit for operation + key.
   * Token bucket algorithm:
   *   - Tokens refill based on elapsed time since last check (lazy)
   *   - Each operation costs 1 token
   *   - If tokens > 0, allow and decrement
   */
  async checkLimit(
    operation: string,
    limit: number,
    key: RateLimitKey,
  ): Promise<RateLimitResult> {
    const entries = Object.entries(key).filter(
      (pair): pair is [string, string] => typeof pair[1] === "string" && pair[1].length > 0,
    );

    if (entries.length === 0) {
      throw new Error("RateLimitKey must have at least one dimension");
    }

    // Use first non-empty dimension (consistent with original Redis impl)
    const [dim, value] = entries[0];
    const bucketKey = this.buildKey(operation, dim, value);
    const nowS = Math.floor(Date.now() / 1000);
    const resetAtS = nowS + this.windowS;

    // Lazy refill + consume
    let bucket = this.buckets.get(bucketKey);

    if (bucket === undefined) {
      // First request — full bucket minus 1 (consuming this request)
      bucket = {
        tokens: limit - 1,
        lastRefillS: nowS,
        expiresAtS: resetAtS,
      };
      this.enforceSizeLimit();
      this.buckets.set(bucketKey, bucket);

      return {
        allowed: true,
        tokens_remaining: bucket.tokens,
        reset_at_s: resetAtS,
        retry_after_ms: 0,
      };
    }

    // Refill tokens based on elapsed time
    const elapsedS = nowS - bucket.lastRefillS;
    if (elapsedS > 0) {
      const refillTokens = Math.floor((elapsedS / this.windowS) * limit);
      bucket.tokens = Math.min(limit, bucket.tokens + refillTokens);
      bucket.lastRefillS = nowS;
    }

    // Try to consume 1 token
    const allowed = bucket.tokens > 0;
    if (allowed) {
      bucket.tokens -= 1;
    }

    // Extend expiry
    bucket.expiresAtS = resetAtS;

    return {
      allowed,
      tokens_remaining: Math.max(0, bucket.tokens),
      reset_at_s: resetAtS,
      retry_after_ms: allowed ? 0 : Math.max(0, (resetAtS - nowS) * 1000),
    };
  }

  // -------------------------------------------------------------------------
  // Domain-specific checks
  // -------------------------------------------------------------------------

  /**
   * Check timeline query rate limit.
   * Enforces: per-scope, per-actor global, per-device.
   */
  async checkTimelineLimit(
    scopeId: string,
    actorId: string,
    deviceId?: string,
  ): Promise<RateLimitResult> {
    // Per-scope limit
    let result = await this.checkLimit(
      "timeline_per_scope",
      this.config.timeline_per_scope,
      { actor_id: actorId, device_id: scopeId },
    );
    if (!result.allowed) return result;

    // Per-actor global limit
    result = await this.checkLimit(
      "timeline_per_actor_global",
      this.config.timeline_per_actor_global,
      { actor_id: actorId },
    );
    if (!result.allowed) return result;

    // Per-device limit (if provided)
    if (deviceId) {
      result = await this.checkLimit(
        "timeline_per_device",
        this.config.timeline_per_device,
        { device_id: deviceId },
      );
    }

    return result;
  }

  /**
   * Check /cmd rate limit.
   * Enforces: per-actor, per-device, per-service.
   */
  async checkCmdLimit(
    actorId: string,
    deviceId?: string,
    serviceId?: string,
  ): Promise<RateLimitResult> {
    // Per-actor limit
    let result = await this.checkLimit(
      "cmd_per_actor",
      this.config.cmd_per_actor,
      { actor_id: actorId },
    );
    if (!result.allowed) return result;

    // Per-device limit
    if (deviceId) {
      result = await this.checkLimit(
        "cmd_per_device",
        this.config.cmd_per_device,
        { device_id: deviceId },
      );
      if (!result.allowed) return result;
    }

    // Per-service limit
    if (serviceId) {
      result = await this.checkLimit(
        "cmd_per_service",
        this.config.cmd_per_service,
        { service_id: serviceId },
      );
    }

    return result;
  }

  /**
   * Check maintenance transition rate limit.
   * Max N per hour (INV-MAINT-01).
   */
  async checkMaintenanceLimit(actorId: string): Promise<RateLimitResult> {
    const limit = this.config.maintenance_per_hour;
    const bucketKey = `rl:maintenance_transition:actor=${actorId}`;
    const nowS = Math.floor(Date.now() / 1000);
    const hourWindowS = 3600;
    const resetAtS = nowS + hourWindowS;

    let bucket = this.buckets.get(bucketKey);

    if (bucket === undefined) {
      // First transition — init counter at (limit - 1) remaining
      bucket = {
        tokens: limit - 1,
        lastRefillS: nowS,
        expiresAtS: resetAtS,
      };
      this.enforceSizeLimit();
      this.buckets.set(bucketKey, bucket);

      return {
        allowed: true,
        tokens_remaining: bucket.tokens,
        reset_at_s: resetAtS,
        retry_after_ms: 0,
      };
    }

    // If the hour window has elapsed, reset
    const elapsedS = nowS - bucket.lastRefillS;
    if (elapsedS >= hourWindowS) {
      bucket.tokens = limit;
      bucket.lastRefillS = nowS;
    }

    const allowed = bucket.tokens > 0;
    if (allowed) {
      bucket.tokens -= 1;
    }

    bucket.expiresAtS = resetAtS;

    return {
      allowed,
      tokens_remaining: Math.max(0, bucket.tokens),
      reset_at_s: resetAtS,
      retry_after_ms: allowed ? 0 : Math.max(0, (resetAtS - nowS) * 1000),
    };
  }

  // -------------------------------------------------------------------------
  // Admin / diagnostic
  // -------------------------------------------------------------------------

  /**
   * Reset rate limit for a specific key (admin).
   */
  async reset(operation: string, dimension: string, value: string): Promise<void> {
    const bucketKey = this.buildKey(operation, dimension, value);
    this.buckets.delete(bucketKey);
    this.buckets.delete(`${bucketKey}:last_refill`); // compat with old key shape
  }

  /**
   * Get current token count (diagnostic).
   */
  async getTokens(operation: string, dimension: string, value: string): Promise<number> {
    const bucketKey = this.buildKey(operation, dimension, value);
    const bucket = this.buckets.get(bucketKey);
    return bucket ? bucket.tokens : 0;
  }

  // -------------------------------------------------------------------------
  // GC / memory management
  // -------------------------------------------------------------------------

  private startGC(): void {
    // Only start if we have access to setInterval (safe in browser + Node)
    if (typeof setInterval === "function") {
      this.gcTimer = setInterval(() => this.sweep(), GC_INTERVAL_MS);

      // Prevent timer from keeping Node.js process alive (if running in Node)
      if (this.gcTimer && typeof this.gcTimer === "object" && "unref" in this.gcTimer) {
        (this.gcTimer as { unref: () => void }).unref();
      }
    }
  }

  /** Remove expired entries */
  private sweep(): void {
    const nowS = Math.floor(Date.now() / 1000);
    const keysToDelete: string[] = [];
    this.buckets.forEach((bucket, key) => {
      if (bucket.expiresAtS <= nowS) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach((key) => this.buckets.delete(key));
  }

  /** Evict oldest entries when size limit exceeded (OOM protection) */
  private enforceSizeLimit(): void {
    if (this.buckets.size < MAX_BUCKET_ENTRIES) return;

    // Evict ~10% oldest entries (by insertion order — Map preserves it)
    const evictCount = Math.ceil(MAX_BUCKET_ENTRIES * 0.1);
    const keysToEvict: string[] = [];
    this.buckets.forEach((_bucket, key) => {
      if (keysToEvict.length < evictCount) {
        keysToEvict.push(key);
      }
    });
    keysToEvict.forEach((key) => this.buckets.delete(key));
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Factory for creating rate limiter.
 * No longer requires Redis URL — purely in-memory.
 *
 * @param _redisUrl - DEPRECATED, ignored. Kept for API compatibility.
 */
export function createRateLimiter(_redisUrl?: string): RateLimiter {
  return new RateLimiter();
}

// ---------------------------------------------------------------------------
// Middleware (server-context compatible)
// ---------------------------------------------------------------------------

/** Minimal typed request shape for middleware compatibility */
interface MiddlewareRequest {
  user?: { id?: string };
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
}

/** Minimal typed response shape for middleware compatibility */
interface MiddlewareResponse {
  status: (code: number) => MiddlewareResponse;
  json: (body: Record<string, unknown>) => void;
  set: (header: string, value: string) => void;
}

type NextFunction = () => void;

/**
 * Middleware for Express/Node.js.
 * Checks rate limit and returns 429 if exceeded.
 *
 * ⚠️  This uses in-memory state — only effective per-process.
 *     For distributed rate limiting, use Redis-backed middleware in your API gateway.
 */
export function rateLimitMiddleware(limiter: RateLimiter, operation: string) {
  return async (req: MiddlewareRequest, res: MiddlewareResponse, next: NextFunction) => {
    const actorId = req.user?.id || (req.headers["x-actor-id"] as string | undefined);
    const deviceId = req.headers["x-device-id"] as string | undefined;
    const serviceId = req.headers["x-service-id"] as string | undefined;

    if (!actorId) {
      res.status(401).json({ error: "Missing actor_id" });
      return;
    }

    let result: RateLimitResult;

    if (operation === "timeline") {
      const scopeId = (req.query.scope_id as string) || "default";
      result = await limiter.checkTimelineLimit(scopeId, actorId, deviceId);
    } else if (operation === "cmd") {
      result = await limiter.checkCmdLimit(actorId, deviceId, serviceId);
    } else {
      result = await limiter.checkLimit(operation, 100, { actor_id: actorId });
    }

    // Set rate limit headers
    res.set("X-RateLimit-Remaining", String(result.tokens_remaining));
    res.set("X-RateLimit-Reset", String(result.reset_at_s));

    if (!result.allowed) {
      res.status(429).json({
        error: "rate_limit_exceeded",
        retry_after_ms: result.retry_after_ms,
      });
      return;
    }

    next();
  };
}
