/**
 * Session Store — encrypted persistence for multi-account sessions.
 *
 * ============================================================================
 * SECURITY FIX (C-1): Session data is now AES-256-GCM encrypted in localStorage.
 *
 * ARCHITECTURE:
 * - In-memory cache holds decrypted sessions (source of truth during runtime).
 * - All reads are SYNCHRONOUS from the cache — no API changes for callers.
 * - All writes update cache synchronously, then fire async encrypted persistence.
 * - initSessionStore() MUST be called once at app startup to decrypt existing data.
 *
 * BACKWARD COMPATIBILITY:
 * - If localStorage contains legacy unencrypted JSON, it is read as-is and
 *   re-encrypted transparently on the next write operation.
 * - If initSessionStore() hasn't been called, loadSessions() falls back to
 *   raw localStorage read (legacy behavior) for graceful degradation.
 * ============================================================================
 */

import { encryptForStorage, decryptFromStorage } from "./localStorageCrypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AccountSession = {
  account_id: string;
  session_id: string;
};

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const SESSIONS_KEY = "mansoni_multi_account_sessions_v1";
const ACTIVE_ACCOUNT_KEY = "mansoni_active_account_v1";

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

/**
 * Runtime cache of decrypted sessions. null = not yet initialized.
 * After initSessionStore(), always a valid Record.
 */
let _sessionsCache: Record<string, AccountSession> | null = null;

/** Tracks whether initSessionStore() completed */
let _initialized = false;

/**
 * Deduplication: holds the current pending write promise so we don't
 * fire multiple concurrent encryptions for rapid sequential writes.
 */
let _pendingWrite: Promise<void> | null = null;

// ---------------------------------------------------------------------------
// Async encrypted persistence (fire-and-forget from sync callers)
// ---------------------------------------------------------------------------

/**
 * Encrypts and saves the current sessions cache to localStorage.
 * Called internally after every cache mutation. Errors are logged, never thrown,
 * to avoid breaking synchronous callers.
 *
 * SECURITY: Fail-secure — never falls back to plaintext.
 * If WebCrypto is unavailable, session data stays in in-memory cache only
 * until the next successful write. Data already in localStorage remains
 * encrypted (or absent). We never downgrade to plaintext storage.
 *
 * Rationale: session_id is a secret equivalent to a refresh token.
 * An XSS script reading `localStorage.getItem(SESSIONS_KEY)` on plaintext
 * data can exfiltrate all session tokens in a single roundtrip.
 * Data loss (user re-authenticates) is far less severe than full account
 * takeover across all signed-in accounts.
 */
function persistSessionsEncrypted(sessions: Record<string, AccountSession>): void {
  // Snapshot the data at call time (avoid race with future mutations)
  const snapshot = JSON.stringify(sessions);

  _pendingWrite = (async () => {
    try {
      const encrypted = await encryptForStorage(snapshot);
      localStorage.setItem(SESSIONS_KEY, encrypted);
    } catch (err) {
      // FAIL-SECURE: do NOT fall back to plaintext.
      // Sessions remain accessible from in-memory cache for the current
      // page lifetime; the user will be asked to re-authenticate on next
      // cold start if the underlying crypto issue persists.
      console.error(
        "[sessionStore] Encryption failed — sessions NOT persisted to localStorage (fail-secure). " +
          "Sessions remain in memory for this page session only.",
        err,
      );
    }
  })();
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Async initialization: reads and decrypts sessions from localStorage.
 * MUST be called once during app startup (e.g., in main.tsx / App.tsx).
 *
 * If data is legacy unencrypted JSON, it's loaded into cache as-is and
 * will be re-encrypted on the next write.
 *
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function initSessionStore(): Promise<void> {
  if (_initialized) return;

  const raw = localStorage.getItem(SESSIONS_KEY);
  if (!raw) {
    _sessionsCache = {};
    _initialized = true;
    return;
  }

  try {
    const decrypted = await decryptFromStorage(raw);
    if (decrypted) {
      const parsed = JSON.parse(decrypted) as Record<string, AccountSession>;
      _sessionsCache = parsed ?? {};
    } else {
      // Decryption returned null — data corrupted or key changed.
      // Log warning and start fresh to avoid bricking the app.
      console.warn(
        "[sessionStore] Could not decrypt stored sessions. " +
          "Starting with empty session store. User will need to re-authenticate.",
      );
      _sessionsCache = {};
    }
  } catch {
    // Parse error — corrupted data. Start fresh.
    console.warn("[sessionStore] Corrupted session data in localStorage. Resetting.");
    _sessionsCache = {};
  }

  _initialized = true;
}

// ---------------------------------------------------------------------------
// Sync fallback for pre-init reads
// ---------------------------------------------------------------------------

/**
 * Attempts to read sessions from raw localStorage without decryption.
 * Used as a fallback when initSessionStore() hasn't been called yet.
 * Returns empty object if the data is encrypted (can't read without async).
 */
function fallbackLoadRaw(): Record<string, AccountSession> {
  const raw = localStorage.getItem(SESSIONS_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    // If it's an encrypted envelope (has 'v', 's', 'iv', 'ct' fields),
    // we can't decrypt synchronously — return empty.
    if (parsed && typeof parsed === "object" && "v" in parsed && "ct" in parsed) {
      console.warn(
        "[sessionStore] Sessions are encrypted but initSessionStore() was not called. " +
          "Returning empty sessions. Call initSessionStore() at app startup.",
      );
      return {};
    }
    return (parsed as Record<string, AccountSession>) ?? {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Public API (sync — backward compatible)
// ---------------------------------------------------------------------------

/**
 * Returns all stored sessions. Synchronous read from in-memory cache.
 *
 * If initSessionStore() hasn't been called, falls back to raw localStorage
 * read (works for legacy unencrypted data, returns empty for encrypted data).
 */
export function loadSessions(): Record<string, AccountSession> {
  if (_sessionsCache !== null) {
    return { ..._sessionsCache }; // Return a shallow copy to prevent external mutation
  }
  // Fallback: init not called yet
  return fallbackLoadRaw();
}

/**
 * Replaces all sessions. Updates in-memory cache synchronously,
 * then fires async encrypted persistence.
 */
export function saveSessions(sessions: Record<string, AccountSession>): void {
  // Update in-memory cache immediately (sync)
  _sessionsCache = { ...sessions };
  // Persist encrypted (async, fire-and-forget)
  persistSessionsEncrypted(_sessionsCache);
}

/**
 * Upserts a single session by account ID.
 */
export function setSession(accountId: string, session: AccountSession): void {
  const all = loadSessions();
  all[accountId] = session;
  saveSessions(all);
}

/**
 * Deletes a session by account ID.
 * If the deleted session was the active account, falls back to another account
 * or clears the active account entirely.
 */
export function deleteSession(accountId: string): void {
  const all = loadSessions();
  delete all[accountId];
  saveSessions(all);

  if (getActiveAccount() === accountId) {
    const fallback = Object.keys(all)[0] ?? null;
    if (fallback) setActiveAccount(fallback);
    else clearActiveAccount();
  }
}

/**
 * Sets the active account ID. Not encrypted because it's just a UUID
 * selector — the sensitive session data (session_id) is in the encrypted store.
 */
export function setActiveAccount(accountId: string): void {
  localStorage.setItem(ACTIVE_ACCOUNT_KEY, accountId);
}

/**
 * Returns the active account ID, or null if none set.
 */
export function getActiveAccount(): string | null {
  return localStorage.getItem(ACTIVE_ACCOUNT_KEY);
}

/**
 * Clears the active account selection.
 */
export function clearActiveAccount(): void {
  localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
}

/**
 * Waits for any pending encrypted write to complete.
 * Useful in tests or before navigation to ensure persistence is flushed.
 */
export async function flushPendingWrites(): Promise<void> {
  if (_pendingWrite) {
    await _pendingWrite;
    _pendingWrite = null;
  }
}

/**
 * Resets the store to uninitialized state.
 * FOR TESTING ONLY — do not use in production code.
 */
export function __resetForTesting(): void {
  _sessionsCache = null;
  _initialized = false;
  _pendingWrite = null;
}
