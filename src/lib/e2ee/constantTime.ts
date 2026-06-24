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
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
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
 * Case-insensitive. Single-pass accumulator — no early return, no dummy loop.
 */
export function safeEqualHex(a: string, b: string): boolean {
  const aLow = a.toLowerCase();
  const bLow = b.toLowerCase();
  let diff = aLow.length ^ bLow.length;
  const len = Math.max(aLow.length, bLow.length);
  for (let i = 0; i < len; i++) {
    const ca = i < aLow.length ? aLow.charCodeAt(i) : 0;
    const cb = i < bLow.length ? bLow.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

// ─── Base64 string comparison ─────────────────────────────────────────────────

/**
 * Constant-time base64 string equality (after normalizing padding).
 */
export function safeEqualBase64(a: string, b: string): boolean {
  const normalize = (s: string) => s.replace(/\s/g, "").replace(/=+$/, "");
  return safeEqualHex(normalize(a), normalize(b));
}

// ─── Generic string comparison ────────────────────────────────────────────────

/**
 * Constant-time string equality. O(n) always.
 */
export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

// ─── Token equality ─────────────────────────────────────────────────────────

/**
 * Constant-time token comparison. Delegates to safeEqualBytes for O(n) no-short-circuit.
 */
export async function safeEqualTokens(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  return safeEqualBytes(enc.encode(a), enc.encode(b));
}

// ─── Numeric PIN comparison ──────────────────────────────────────────────────

/**
 * Constant-time comparison of numeric PINs / OTP codes.
 */
export function safeEqualPin(a: string | number, b: string | number): boolean {
  const strA = String(a).padStart(10, "0");
  const strB = String(b).padStart(10, "0");
  return safeEqual(strA, strB);
}
