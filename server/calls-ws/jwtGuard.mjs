/**
 * JWT revalidation guard for long-lived WebSocket connections.
 *
 * Problem: A WebSocket connection auth'd with a valid JWT may stay open after
 * that JWT expires (Supabase default access-token TTL is 3600 s). Without
 * periodic re-check, a revoked or expired token remains active for the entire
 * session lifetime — a zero-trust violation.
 *
 * Solution: periodic silent re-validation against the upstream auth provider.
 * On failure the connection is cleanly terminated with close code 4001.
 *
 * Design notes:
 * - `needsRevalidation` is a cheap synchronous predicate — no I/O.
 * - `revalidate` is async and must be awaited before processing the next frame
 *   on an authenticated connection that is past its revalidation deadline.
 * - `startPeriodicCheck` is used for entirely idle connections that never send
 *   frames (e.g. a receiver-only client). It fires every revalidateIntervalMs.
 * - `stopPeriodicCheck` MUST be called in ws.on("close") to avoid interval leaks.
 *
 * Fix H-1: conn._revalidating flag prevents parallel revalidation requests.
 * Fix H-2: conn._consecutiveAuthFailures counter — closes after MAX_CONSECUTIVE_FAILURES.
 * Fix M-3: retryable: true ONLY for auth_provider_unreachable; false for expired/revoked.
 * Fix M-4: crypto.randomUUID() replaces Math.random()-based _uuid().
 */

import crypto from "node:crypto";

// H-2: maximum consecutive auth failures before forced disconnect
const MAX_CONSECUTIVE_FAILURES = (() => {
  const n = parseInt(process.env.CALLS_WS_JWT_MAX_FAILURES ?? "3", 10);
  return Number.isFinite(n) && n > 0 ? n : 3;
})();

// H-2: grace period extended to current time when auth provider is temporarily down
const GRACE_PERIOD_MS = 10_000;

/**
 * @typedef {object} JwtGuardOptions
 * @property {number} revalidateIntervalMs  - How often to re-check. Default 60 000.
 * @property {(token: string) => Promise<{ok: boolean, userId?: string, reason?: string}>} validateFn
 */

/**
 * Factory — creates a JWT guard instance.
 *
 * @param {JwtGuardOptions} options
 * @returns {{
 *   needsRevalidation(conn: object): boolean,
 *   revalidate(conn: object, ws: WebSocket, sendFn: Function): Promise<boolean>,
 *   startPeriodicCheck(conn: object, ws: WebSocket, sendFn: Function): ReturnType<typeof setInterval>,
 *   stopPeriodicCheck(id: ReturnType<typeof setInterval>): void
 * }}
 */
export function createJwtGuard({ revalidateIntervalMs, validateFn }) {
  if (typeof revalidateIntervalMs !== "number" || revalidateIntervalMs < 1000) {
    throw new Error("jwtGuard: revalidateIntervalMs must be >= 1000 ms");
  }
  if (typeof validateFn !== "function") {
    throw new Error("jwtGuard: validateFn must be a function");
  }

  /**
   * Synchronous check — has the revalidation window elapsed?
   * H-1: Returns false if revalidation is already in-flight (conn._revalidating).
   *
   * @param {object} conn  - Connection state object (must have authVerifiedAt: number)
   * @returns {boolean}
   */
  function needsRevalidation(conn) {
    if (!conn.authenticated) return false;
    // H-1: already in-flight — skip to prevent parallel Supabase requests
    if (conn._revalidating) return false;
    if (typeof conn.authVerifiedAt !== "number") return true; // never stamped → treat as expired
    return Date.now() - conn.authVerifiedAt > revalidateIntervalMs;
  }

  /**
   * Async re-validation. Calls validateFn with the stored access token.
   * On success: stamps conn.authVerifiedAt, resets failure counter, returns true.
   * On transient error: increments failure counter; closes if >= MAX_CONSECUTIVE_FAILURES.
   * On token invalid: sends AUTH_FAIL, closes socket with 4001, returns false.
   *
   * H-1: Sets conn._revalidating = true during the async operation.
   * H-2: Tracks conn._consecutiveAuthFailures; disconnects on threshold exceeded.
   *
   * @param {object}   conn     - Connection state (must have conn.accessToken)
   * @param {object}   ws       - WebSocket instance
   * @param {Function} sendFn   - send(ws, frame) helper
   * @returns {Promise<boolean>}
   */
  async function revalidate(conn, ws, sendFn) {
    // Guard: if no token stored, we cannot revalidate → close
    if (!conn.accessToken || typeof conn.accessToken !== "string") {
      _closeExpired(conn, ws, sendFn, "no_token");
      return false;
    }

    // H-1: Lock — prevent parallel revalidation calls
    conn._revalidating = true;

    try {
      let result;
      try {
        result = await validateFn(conn.accessToken);
      } catch (err) {
        // Network error or provider down.
        // H-2: increment failure counter; disconnect after MAX_CONSECUTIVE_FAILURES
        conn._consecutiveAuthFailures = (conn._consecutiveAuthFailures ?? 0) + 1;
        console.warn(
          `[jwtGuard] transient error during revalidation for userId=${conn.userId} ` +
          `(failure ${conn._consecutiveAuthFailures}/${MAX_CONSECUTIVE_FAILURES}): ${err?.message}`
        );

        if (conn._consecutiveAuthFailures >= MAX_CONSECUTIVE_FAILURES) {
          // Too many consecutive failures — revoked tokens must not live forever
          _closeExpired(conn, ws, sendFn, "auth_provider_unreachable");
          return false;
        }

        // Grant a short grace period and continue
        conn.authVerifiedAt = Date.now() - revalidateIntervalMs + GRACE_PERIOD_MS;
        return true;
      }

      if (result?.ok) {
        // H-2: reset on success
        conn._consecutiveAuthFailures = 0;
        conn.authVerifiedAt = Date.now();
        return true;
      }

      _closeExpired(conn, ws, sendFn, result?.reason ?? "token_expired");
      return false;
    } finally {
      // H-1: Always release the lock, even on throw
      conn._revalidating = false;
    }
  }

  /**
   * Sends AUTH_FAIL and closes the WebSocket.
   * M-3: retryable is true ONLY when reason is "auth_provider_unreachable".
   *      token_expired / token_revoked → retryable: false (retrying with the
   *      same invalid token would be pointless and wastes auth-provider quota).
   *
   * @param {object}   conn
   * @param {object}   ws
   * @param {Function} sendFn
   * @param {string}   reason
   */
  function _closeExpired(conn, ws, sendFn, reason) {
    // M-3: only transient provider errors are retryable
    const retryable = reason === "auth_provider_unreachable";
    try {
      sendFn(ws, {
        v: 1,
        type: "AUTH_FAIL",
        // M-4: crypto.randomUUID() instead of Math.random()-based _uuid()
        msgId: crypto.randomUUID(),
        ts: Date.now(),
        payload: { reason, retryable },
      });
    } catch {
      // socket may already be closing; ignore send error
    }
    try {
      ws.close(4001, "TOKEN_EXPIRED");
    } catch {
      // already closed
    }
  }

  /**
   * Starts a periodic background check for idle connections.
   * The interval is automatically cleared on ws close (caller must call stopPeriodicCheck).
   *
   * @param {object}   conn
   * @param {object}   ws
   * @param {Function} sendFn
   * @returns {ReturnType<typeof setInterval>}
   */
  function startPeriodicCheck(conn, ws, sendFn) {
    const id = setInterval(async () => {
      if (!conn.authenticated) return; // not yet authed, nothing to check
      if (needsRevalidation(conn)) {
        await revalidate(conn, ws, sendFn);
      }
    }, revalidateIntervalMs);
    id.unref?.(); // don't keep process alive solely for this interval
    return id;
  }

  /**
   * Stops the periodic check interval.
   * @param {ReturnType<typeof setInterval>} intervalId
   */
  function stopPeriodicCheck(intervalId) {
    if (intervalId != null) clearInterval(intervalId);
  }

  return { needsRevalidation, revalidate, startPeriodicCheck, stopPeriodicCheck };
}
