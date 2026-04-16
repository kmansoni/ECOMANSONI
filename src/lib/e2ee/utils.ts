/**
 * Shared binary/base64 utilities for the E2EE module.
 * Centralised here to avoid duplication across crypto.ts, keyDistribution.ts, keyStore.ts, sframe.ts.
 */

// SECURITY FIX: Replaced O(n²) string concatenation with chunked approach.
// The original `binary += String.fromCharCode(bytes[i])` loop is O(n²) due to
// string immutability — each concatenation copies the entire accumulated string.
// For large media frames (e.g. 64KB video keyframes) this causes GC pressure and
// measurable latency spikes in the encrypt/decrypt hot path.
// Chunked fromCharCode.apply stays O(n) and avoids call-stack overflow on large buffers.
export function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const CHUNK = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return btoa(binary);
}

export function fromBase64(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const buf = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return buf;
}
