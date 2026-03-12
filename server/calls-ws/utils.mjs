/**
 * Shared utilities for calls-ws subsystem.
 * Extracted to avoid duplication between rateLimit.mjs and index.mjs.
 */

/**
 * Safe integer parser — prevents NaN from malformed env vars silently
 * disabling rate limits or other thresholds.
 *
 * Returns `fallback` when:
 * - val is undefined / null / empty string
 * - parseInt produces NaN
 * - result is not a finite positive integer
 *
 * @param {string|undefined} val
 * @param {number} fallback  Must be a finite positive integer
 * @returns {number}
 */
export function safeParseInt(val, fallback) {
  const n = parseInt(val, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
