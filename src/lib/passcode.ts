/** @deprecated Use pbkdf2Hash instead — SHA-256 without salt is not safe for passwords. */
export async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder();
  const bytes = enc.encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const arr = Array.from(new Uint8Array(digest));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constant-time hex string comparison.
 * Prevents timing side-channel attacks when comparing PBKDF2 digests.
 * Both strings must be equal length for the comparison to be meaningful;
 * an early-exit on length mismatch leaks only the length, not the content.
 */
function timingSafeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Low-level PBKDF2-SHA-256 with 600 000 iterations (OWASP 2023).
 * Caller is responsible for providing a cryptographically random salt.
 * Returns only the raw derived hex — no prefix.
 */
async function pbkdf2DeriveHex(password: string, saltBytes: ArrayBuffer): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: saltBytes,
      iterations: 600_000,
    },
    keyMaterial,
    256,
  );
  return toHex(new Uint8Array(derived));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Hashes a password with a freshly-generated, cryptographically random 16-byte
 * salt (OWASP recommendation).
 *
 * Output format: `"pbkdf2$<saltHex>$<hashHex>"` — self-contained, no separate
 * salt storage required.  The 3-part format distinguishes it from the previous
 * 2-part legacy format and from raw SHA-256 hashes.
 */
export async function pbkdf2Hash(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = toHex(salt);
  const hashHex = await pbkdf2DeriveHex(password, salt.buffer);
  return `pbkdf2$${saltHex}$${hashHex}`;
}

/**
 * @deprecated Use pbkdf2Hash — this variant derives the salt from userId which
 * may be predictable (public UUID). Kept only for backward-compatible
 * verification inside verifyPasscodeHash.
 */
async function pbkdf2HexLegacy(password: string, userId: string): Promise<string> {
  const enc = new TextEncoder();
  const saltDigest = await crypto.subtle.digest("SHA-256", enc.encode(userId));
  const hashHex = await pbkdf2DeriveHex(password, saltDigest);
  return `pbkdf2$${hashHex}`;
}

/**
 * Verifies a password against a stored hash.  Supports three formats in order
 * of security (newest first):
 *
 *  1. `"pbkdf2$<saltHex>$<hashHex>"` — current random-salt PBKDF2 (3 parts)
 *  2. `"pbkdf2$<hashHex>"`           — legacy userId-salt PBKDF2 (2 parts)
 *  3. raw 64-char hex                — legacy SHA-256 (no prefix)
 *
 * When `legacy: true` is returned the caller SHOULD re-hash with `pbkdf2Hash`
 * and persist the result so the account is transparently upgraded on next login.
 *
 * @returns `{ match: boolean; legacy: boolean }`
 */
export async function verifyPasscodeHash(
  password: string,
  userId: string,
  storedHash: string,
): Promise<{ match: boolean; legacy: boolean }> {
  if (storedHash.startsWith("pbkdf2$")) {
    const parts = storedHash.split("$");
    if (parts.length === 3) {
      // New format: pbkdf2$<saltHex>$<hashHex>
      const saltBytes = Uint8Array.from(
        (parts[1].match(/.{2}/g) ?? []).map((b) => parseInt(b, 16)),
      );
      const candidate = await pbkdf2DeriveHex(password, saltBytes.buffer);
      return { match: timingSafeHexEqual(candidate, parts[2]), legacy: false };
    }
    // Legacy format: pbkdf2$<hashHex> (userId-derived salt)
    const candidate = await pbkdf2HexLegacy(password, userId);
    return { match: timingSafeHexEqual(candidate, storedHash), legacy: true };
  }
  // Legacy path: plain SHA-256 (64 hex chars, no prefix)
  const candidate = await sha256Hex(password);
  return { match: timingSafeHexEqual(candidate, storedHash), legacy: true };
}
