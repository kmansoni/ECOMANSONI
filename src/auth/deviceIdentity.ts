/**
 * Device Identity — encrypted persistence for device_uid + device_secret.
 *
 * ============================================================================
 * SECURITY FIX (C-2): device_uid and device_secret are now AES-256-GCM
 * encrypted in localStorage via Web Crypto API.
 *
 * THREAT MODEL:
 * - device_secret is a bearer credential used to authenticate the device
 *   to the auth service. Plain storage in localStorage allows XSS to
 *   fully impersonate the device.
 * - Encryption with a key derived from browser fingerprint (origin + UA + screen)
 *   prevents blind exfiltration of the secret.
 *
 * ARCHITECTURE (same pattern as sessionStore.ts):
 * - In-memory cache holds decrypted identity (source of truth at runtime).
 * - Sync reads from cache, async encrypted writes.
 * - initDeviceIdentity() MUST be called once at app startup.
 *
 * BACKWARD COMPATIBILITY:
 * - Legacy unencrypted JSON is read once during init and immediately
 *   re-encrypted.
 * - If initDeviceIdentity() hasn't been called, sync reads do not parse
 *   plaintext from localStorage (fail-closed).
 * ============================================================================
 */

import { encryptForStorage, decryptFromStorage } from "./localStorageCrypto";
import { logger } from "../lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeviceIdentity = {
  device_uid: string;
  device_secret: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEVICE_KEY = "mansoni_device_identity_v1";

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

/** Cached decrypted identity. null = not yet initialized. */
let _identityCache: DeviceIdentity | null = null;

/** Whether initDeviceIdentity() has completed */
let _initialized = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generates a cryptographically secure base64url string.
 * Used for device_secret generation.
 */
function randBase64Url(size = 32): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/**
 * Creates a new device identity with cryptographically random values.
 */
function generateNewIdentity(): DeviceIdentity {
  return {
    device_uid: crypto.randomUUID(),
    device_secret: randBase64Url(32),
  };
}

// ---------------------------------------------------------------------------
// Async encrypted persistence
// ---------------------------------------------------------------------------

/**
 * Encrypts and saves the identity to localStorage.
 * Fire-and-forget from sync callers; errors are logged, never thrown.
 */
function persistIdentityEncrypted(identity: DeviceIdentity): void {
  const snapshot = JSON.stringify(identity);

  (async () => {
    try {
      const encrypted = await encryptForStorage(snapshot);
      localStorage.setItem(DEVICE_KEY, encrypted);
    } catch (err) {
      // FAIL-SECURE: do NOT write plaintext device_secret.
      logger.error(
        "[deviceIdentity] Encryption failed — identity NOT persisted to localStorage (fail-secure).",
        { error: err },
      );
    }
  })();
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Async initialization: reads and decrypts device identity from localStorage.
 * MUST be called once during app startup (alongside initSessionStore()).
 *
 * If no identity exists, one is generated and encrypted.
 * If data is legacy unencrypted JSON, it's loaded and re-encrypted.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function initDeviceIdentity(): Promise<DeviceIdentity> {
  if (_initialized && _identityCache) return _identityCache;

  const raw = localStorage.getItem(DEVICE_KEY);

  if (raw) {
    try {
      const decrypted = await decryptFromStorage(raw);
      if (decrypted) {
        const parsed = JSON.parse(decrypted) as DeviceIdentity;
        if (parsed?.device_uid && parsed?.device_secret) {
          _identityCache = parsed;
          _initialized = true;

          // Re-encrypt legacy plaintext data immediately
          // (decryptFromStorage returns raw string for legacy data,
          //  so if the raw string === decrypted, it was plaintext)
          if (raw === decrypted) {
            persistIdentityEncrypted(parsed);
          }

          return _identityCache;
        }
      }
    } catch {
      // Corrupted data — will generate new identity below
      logger.warn("[deviceIdentity] Corrupted identity data. Generating new identity.");
      localStorage.removeItem(DEVICE_KEY);
    }
  }

  // No valid identity found — generate a new one
  _identityCache = generateNewIdentity();
  _initialized = true;
  persistIdentityEncrypted(_identityCache);
  return _identityCache;
}

// ---------------------------------------------------------------------------
// Sync fallback for pre-init reads
// ---------------------------------------------------------------------------

/**
 * Strict sync fallback when init was not called yet.
 * Never parses plaintext localStorage data.
 */
function fallbackLoadRaw(): DeviceIdentity | null {
  if (localStorage.getItem(DEVICE_KEY)) {
    logger.warn(
      "[deviceIdentity] initDeviceIdentity() was not called before loadOrCreateDeviceIdentity().",
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API (sync — backward compatible)
// ---------------------------------------------------------------------------

/**
 * Returns the device identity from cache, or creates a new one if none exists.
 *
 * IMPORTANT: Call initDeviceIdentity() at app startup.
 * Pre-init sync read intentionally does not load plaintext from storage.
 *
 * Sync return for backward compatibility with all callers.
 */
export function loadOrCreateDeviceIdentity(): DeviceIdentity {
  // Return from cache if initialized
  if (_identityCache) return _identityCache;

  // Fail-closed pre-init fallback.
  const legacy = fallbackLoadRaw();
  if (legacy) {
    _identityCache = legacy;
    return legacy;
  }

  // No identity at all — generate new one and cache it
  const next = generateNewIdentity();
  _identityCache = next;
  persistIdentityEncrypted(next);
  return next;
}

/**
 * Resets the identity store to uninitialized state.
 * FOR TESTING ONLY — do not use in production code.
 */
export function __resetForTesting(): void {
  _identityCache = null;
  _initialized = false;
}
