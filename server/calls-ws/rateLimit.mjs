/**
 * Sliding-window rate limiter for WebSocket connections.
 *
 * Each bucket stores two timestamp arrays:
 *   ts[]         — sliding window of ALLOWED request timestamps
 *   rejectedTs[] — sliding window of REJECTED request timestamps
 *
 * On every check():
 *   1. Evict timestamps older than windowMs from both arrays.
 *   2. Count allowed entries.
 *   3. If rejectedTs.length >= limit * (HARD_MULTIPLIER - 1) → RATE_EXCEEDED_DISCONNECT.
 *   4. If count >= limit → push to rejectedTs (capped at REJECT_CAP), return RATE_LIMITED.
 *   5. Otherwise → push to ts, allow.
 *
 * Memory footprint: O(limit * HARD_MULTIPLIER) per bucket per connection.
 * No shared state — each connection owns its own limiter instance.
 *
 * Fixes applied:
 *   C-1  — rejectedTs counter makes RATE_EXCEEDED_DISCONNECT reachable.
 *   M-1  — BUCKET_ALIASES collapse call.* types into one shared "_call_action" bucket.
 *   M-2  — safeParseInt() (imported from utils.mjs) prevents NaN disabling limits.
 *   L-1  — getStats() exposes cumulative totalRejected counter.
 *   #1   — REJECT_CAP prevents rejectedTs growing unboundedly under sustained attack.
 *   #3   — Startup warning for deprecated per-type call action env vars.
 *   #7   — safeParseInt imported from shared utils.mjs (no duplication).
 */

import { readPositiveIntEnv } from "./env.mjs";
import { logger as baseLogger } from "./logger.mjs";

const logger = baseLogger.child({ context: "rateLimit" });

const HARD_MULTIPLIER = 5; // disconnect threshold: rejectedTs.length >= limit * (HARD_MULTIPLIER - 1)

// #1: Hard upper bound on rejectedTs to prevent OOM under sustained DoS.
// Any rejection beyond this cap still triggers RATE_EXCEEDED_DISCONNECT immediately.
const REJECT_CAP_MULTIPLIER = HARD_MULTIPLIER; // rejectedTs.length never exceeds limit * REJECT_CAP_MULTIPLIER

// ---------------------------------------------------------------------------
// #3: Warn at startup if deprecated per-type call-action env vars are set.
// After M-1 they are no longer read; only RL_CALL_ACTION_LIMIT/WINDOW_MS matter.
// ---------------------------------------------------------------------------
const DEPRECATED_CALL_ACTION_ENVS = [
  "RL_CALL_ACCEPT_LIMIT",
  "RL_CALL_ACCEPT_WINDOW_MS",
  "RL_CALL_DECLINE_LIMIT",
  "RL_CALL_DECLINE_WINDOW_MS",
  "RL_CALL_CANCEL_LIMIT",
  "RL_CALL_CANCEL_WINDOW_MS",
  "RL_CALL_HANGUP_LIMIT",
  "RL_CALL_HANGUP_WINDOW_MS",
  "RL_CALL_REKEY_LIMIT",
  "RL_CALL_REKEY_WINDOW_MS",
];
for (const envKey of DEPRECATED_CALL_ACTION_ENVS) {
  if (process.env[envKey] !== undefined) {
    logger.warn(
      {
        event: "rate_limit.deprecated_env",
        envKey,
      },
      `[rateLimit] DEPRECATED env var "${envKey}" is set but no longer used. ` +
        `All call action types now share the "_call_action" bucket. ` +
        `Use RL_CALL_ACTION_LIMIT / RL_CALL_ACTION_WINDOW_MS instead.`
    );
  }
}

/**
 * Default rate-limit table.
 * Each entry: { limit: number, windowMs: number }
 * "GLOBAL" is checked for every incoming frame before type-specific check.
 *
 * M-1: call.accept / call.decline / call.cancel / call.hangup / call.rekey
 *      map to a single shared "_call_action" bucket via BUCKET_ALIASES.
 */
export const DEFAULT_RATE_LIMITS = Object.freeze({
  GLOBAL:        { limit: readPositiveIntEnv("RL_GLOBAL_LIMIT", 60), windowMs: readPositiveIntEnv("RL_GLOBAL_WINDOW_MS", 10000) },
  HELLO:         { limit: readPositiveIntEnv("RL_HELLO_LIMIT", 2), windowMs: readPositiveIntEnv("RL_HELLO_WINDOW_MS", 30000) },
  AUTH:          { limit: readPositiveIntEnv("RL_AUTH_LIMIT", 3), windowMs: readPositiveIntEnv("RL_AUTH_WINDOW_MS", 60000) },
  ROOM_CREATE:   { limit: readPositiveIntEnv("RL_ROOM_CREATE_LIMIT", 3), windowMs: readPositiveIntEnv("RL_ROOM_CREATE_WINDOW_MS", 60000) },
  ROOM_JOIN:     { limit: readPositiveIntEnv("RL_ROOM_JOIN_LIMIT", 5), windowMs: readPositiveIntEnv("RL_ROOM_JOIN_WINDOW_MS", 60000) },
  "call.invite": { limit: readPositiveIntEnv("RL_CALL_INVITE_LIMIT", 10), windowMs: readPositiveIntEnv("RL_CALL_INVITE_WINDOW_MS", 60000) },
  // M-1: single shared bucket for all call action types (accept/decline/cancel/hangup/rekey)
  _call_action:  { limit: readPositiveIntEnv("RL_CALL_ACTION_LIMIT", 20), windowMs: readPositiveIntEnv("RL_CALL_ACTION_WINDOW_MS", 60000) },
  KEY_PACKAGE:   { limit: readPositiveIntEnv("RL_KEY_PACKAGE_LIMIT", 30), windowMs: readPositiveIntEnv("RL_KEY_PACKAGE_WINDOW_MS", 60000) },
  KEY_ACK:       { limit: readPositiveIntEnv("RL_KEY_ACK_LIMIT", 30), windowMs: readPositiveIntEnv("RL_KEY_ACK_WINDOW_MS", 60000) },
  REKEY_BEGIN:   { limit: readPositiveIntEnv("RL_REKEY_BEGIN_LIMIT", 3), windowMs: readPositiveIntEnv("RL_REKEY_BEGIN_WINDOW_MS", 60000) },
  REKEY_COMMIT:  { limit: readPositiveIntEnv("RL_REKEY_COMMIT_LIMIT", 3), windowMs: readPositiveIntEnv("RL_REKEY_COMMIT_WINDOW_MS", 60000) },
  SYNC_MAILBOX:  { limit: readPositiveIntEnv("RL_SYNC_MAILBOX_LIMIT", 5), windowMs: readPositiveIntEnv("RL_SYNC_MAILBOX_WINDOW_MS", 60000) },
  MAILBOX_ACK:   { limit: readPositiveIntEnv("RL_MAILBOX_ACK_LIMIT", 10), windowMs: readPositiveIntEnv("RL_MAILBOX_ACK_WINDOW_MS", 60000) },
  E2EE_CAPS:     { limit: readPositiveIntEnv("RL_E2EE_CAPS_LIMIT", 2), windowMs: readPositiveIntEnv("RL_E2EE_CAPS_WINDOW_MS", 60000) },
});

/**
 * M-1: Maps incoming frame types to shared bucket names.
 * All aliased types count against the same sliding window.
 */
const BUCKET_ALIASES = Object.freeze({
  "call.accept":  "_call_action",
  "call.decline": "_call_action",
  "call.cancel":  "_call_action",
  "call.hangup":  "_call_action",
  "call.rekey":   "_call_action",
});

/**
 * @typedef {{ allowed: boolean, reason: string|undefined }} CheckResult
 */

/**
 * Factory — creates a per-connection rate limiter.
 *
 * @param {typeof DEFAULT_RATE_LIMITS} limits
 * @returns {{ check(type: string): CheckResult, checkGlobal(): CheckResult, getStats(): object }}
 */
export function createRateLimiter(limits) {
  /**
   * bucket structure: { ts: number[], rejectedTs: number[] }
   *   ts         — allowed timestamps (ascending, evicted from front)
   *   rejectedTs — rejected timestamps (ascending, evicted from front, capped)
   */
  const buckets = new Map();

  // L-1: cumulative rejected counter (never resets — use for monotonic metrics)
  let totalRejected = 0;

  /**
   * Slide the window and evaluate.
   *
   * @param {string} bucketKey
   * @param {number} limit
   * @param {number} windowMs
   * @returns {CheckResult}
   */
  function _check(bucketKey, limit, windowMs) {
    const now = Date.now();
    const cutoff = now - windowMs;

    let bucket = buckets.get(bucketKey);
    if (!bucket) {
      bucket = { ts: [], rejectedTs: [] };
      buckets.set(bucketKey, bucket);
    }

    // Evict expired allowed entries (array is append-only → sorted ascending)
    let i = 0;
    while (i < bucket.ts.length && bucket.ts[i] <= cutoff) i++;
    if (i > 0) bucket.ts.splice(0, i);

    // Evict expired rejected entries
    let j = 0;
    while (j < bucket.rejectedTs.length && bucket.rejectedTs[j] <= cutoff) j++;
    if (j > 0) bucket.rejectedTs.splice(0, j);

    const count = bucket.ts.length;
    const rejectedCount = bucket.rejectedTs.length;

    // C-1: Hard disconnect — attacker exceeded rejection budget for this window.
    // Also fires immediately if rejectedTs is at cap (sustained attack scenario).
    const rejectThreshold = limit * (HARD_MULTIPLIER - 1);
    if (rejectedCount >= rejectThreshold) {
      totalRejected++; // L-1
      // Do NOT push to rejectedTs — it's already at or past threshold.
      return { allowed: false, reason: "RATE_EXCEEDED_DISCONNECT" };
    }

    // Soft limit
    if (count >= limit) {
      // #1: Only push to rejectedTs if below cap — prevents OOM under sustained DoS.
      const rejectCap = limit * REJECT_CAP_MULTIPLIER;
      if (bucket.rejectedTs.length < rejectCap) {
        bucket.rejectedTs.push(now);
      }
      totalRejected++; // L-1
      return { allowed: false, reason: "RATE_LIMITED" };
    }

    bucket.ts.push(now);
    return { allowed: true, reason: undefined };
  }

  return {
    /**
     * Check per-type rate limit.
     * Returns { allowed: true } if no limit is configured for this type.
     * M-1: Resolves bucket alias before checking.
     *
     * @param {string} type
     * @returns {CheckResult}
     */
    check(type) {
      // M-1: resolve alias first, then look up config using bucket name
      const bucketName = BUCKET_ALIASES[type] ?? type;
      const cfg = limits[bucketName];
      if (!cfg) return { allowed: true, reason: undefined };
      return _check(`t:${bucketName}`, cfg.limit, cfg.windowMs);
    },

    /**
     * Check the global (all-messages) rate limit.
     * @returns {CheckResult}
     */
    checkGlobal() {
      const cfg = limits.GLOBAL;
      if (!cfg) return { allowed: true, reason: undefined };
      return _check("GLOBAL", cfg.limit, cfg.windowMs);
    },

    /**
     * Diagnostic snapshot — safe to expose in internal /metrics.
     * L-1: includes totalRejected cumulative counter.
     * Note: totalRejected is per-instance (per-connection). For process-level
     * aggregation, callers must sum across all active connection stats.
     *
     * @returns {object}
     */
    getStats() {
      const stats = { totalRejected };
      for (const [key, bucket] of buckets.entries()) {
        stats[key] = { allowed: bucket.ts.length, rejected: bucket.rejectedTs.length };
      }
      return stats;
    },
  };
}
