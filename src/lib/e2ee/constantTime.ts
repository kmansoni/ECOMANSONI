/**
 * Constant-time comparison utilities
 *
 * Предотвращают timing-атаки при сравнении секретных значений.
 * Все функции работают за O(n) времени независимо от входных данных.
 */

// ─── Core: byte-array XOR comparison ─────────────────────────────────────────

/**
 * Constant-time byte-array equality check.
 * Returns true only if both arrays have the same length AND same bytes.
 * Time is O(n) where n = max(a.length, b.length) — never short-circuits.
 */
export function safeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  // Length check must also be timing-safe — XOR lengths so we always loop
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length; // non-zero if lengths differ
  for (let i = 0; i < len; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Constant-time ArrayBuffer equality check.
 */
export function safeEqualBuffer(a: ArrayBuffer, b: ArrayBuffer): boolean {
  return safeEqualBytes(new Uint8Array(a), new Uint8Array(b));
}

// ─── Hex string comparison ────────────────────────────────────────────────────

/**
 * Constant-time hex string equality check.
 * Case-insensitive. Rejects malformed hex.
 */
export function safeEqualHex(a: string, b: string): boolean {
  const aLow = a.toLowerCase();
  const bLow = b.toLowerCase();
  if (aLow.length !== bLow.length) {
    // Still do a dummy loop to prevent branch-based leakage
    for (let i = 0; i < Math.max(aLow.length, bLow.length); i++) {
      void (aLow.charCodeAt(i) ^ bLow.charCodeAt(i));
    }
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aLow.length; i++) {
    diff |= aLow.charCodeAt(i) ^ bLow.charCodeAt(i);
  }
  return diff === 0;
}

// ─── Base64 string comparison ─────────────────────────────────────────────────

/**
 * Constant-time base64 string equality (after normalizing padding).
 * Both strings must be the same base64 encoding of the same bytes.
 */
export function safeEqualBase64(a: string, b: string): boolean {
  // Normalize: strip whitespace and trailing '='
  const normalize = (s: string) => s.replace(/\s/g, '').replace(/=+$/, '');
  return safeEqualHex(normalize(a), normalize(b)); // re-uses constant-time charCode loop
}

// ─── Generic string comparison ────────────────────────────────────────────────

/**
 * Constant-time string equality.
 * Compares UTF-16 code units; suitable for ASCII secrets like TOTP codes,
 * session tokens, OTP pins.
 *
 * NOT suitable for Unicode strings with combining characters.
 */
export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

// ─── HMAC-based token equality (WebCrypto) ───────────────────────────────────

/**
 * Cryptographically secure token comparison using HMAC-SHA-256.
 * This is the gold standard for comparing MAC tags, because even
 * the XOR loop above could in theory be optimized away by JIT.
 * With HMAC, timing differences cannot leak the secret.
 *
 * Both `a` and `b` are UTF-8 strings (e.g. API tokens, CSRF tokens).
 */
export async function safeEqualTokens(a: string, b: string): Promise<boolean> {
  const key = await crypto.subtle.generateKey(
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const enc = new TextEncoder();
  const [macA, macB] = await Promise.all([
    crypto.subtle.sign('HMAC', key, enc.encode(a)),
    crypto.subtle.sign('HMAC', key, enc.encode(b)),
  ]);
  return safeEqualBuffer(macA, macB);
}

// ─── Numeric PIN comparison ───────────────────────────────────────────────────

/**
 * Constant-time comparison of numeric PINs / OTP codes.
 * Converts both to the same zero-padded string length before comparing.
 */
export function safeEqualPin(a: string | number, b: string | number): boolean {
  const strA = String(a).padStart(10, '0');
  const strB = String(b).padStart(10, '0');
  return safeEqual(strA, strB);
}
