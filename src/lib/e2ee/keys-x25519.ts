/**
 * X25519 + Ed25519 adapter over @noble/curves.
 *
 * WebCrypto does NOT support X25519 in browsers.
 * We use @noble/curves (pure JS, works everywhere).
 *
 * Signal spec alignment:
 *   X25519  → DH key agreement (X3DH DH1-DH4, Double Ratchet ratchet step)
 *   Ed25519 → signing (SPK signature in X3DH PreKeyBundle, sender keys)
 *
 * Key formats:
 *   X25519 secretKey  = 32 bytes (raw scalar)
 *   X25519 publicKey  = 32 bytes (u-coordinate)
 *   Ed25519 secretKey = 64 bytes (first 32 = seed, last 32 = public key)
 *   Ed25519 publicKey = 32 bytes (compressed Edwards Y coordinate)
 *
 * @noble/curves 2.x: ed25519 keygen() returns { secretKey: 64B, publicKey: 32B }
 * x25519 keygen() returns { secretKey: 32B, publicKey: 32B }
 */

import { x25519 } from '@noble/curves/ed25519.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { toBase64, fromBase64 } from './utils';

// ─── Raw ↔ hex ────────────────────────────────────────────────────────────

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

// ─── X25519 ───────────────────────────────────────────────────────────────

export function generateX25519KeyPair(): { publicKey: Uint8Array; privateKey: Uint8Array } {
  const kp = x25519.keygen();
  return { publicKey: kp.publicKey, privateKey: kp.secretKey };
}

export function x25519DeriveSecret(
  localPrivateKey: Uint8Array,
  remotePublicKey: Uint8Array,
): Uint8Array {
  return x25519.getSharedSecret(localPrivateKey, remotePublicKey);
}

export function importX25519PublicKey(base64: string): Uint8Array {
  return new Uint8Array(fromBase64(base64));
}

export function importX25519PrivateKey(base64: string): Uint8Array {
  return new Uint8Array(fromBase64(base64));
}

export function exportX25519PublicKey(key: Uint8Array): string {
  return toBase64(key.buffer as ArrayBuffer);
}

export function exportX25519PrivateKey(key: Uint8Array): string {
  return toBase64(key.buffer as ArrayBuffer);
}

// ─── Ed25519 ─────────────────────────────────────────────────────────────

export function generateEd25519KeyPair(): { publicKey: Uint8Array; privateKey: Uint8Array } {
  const kp = ed25519.keygen();
  return { publicKey: kp.publicKey, privateKey: kp.secretKey };
}

export function ed25519Sign(
  privateKey: Uint8Array,
  message: Uint8Array,
): Uint8Array {
  return ed25519.sign(message, privateKey);
}

export function ed25519Verify(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array,
): boolean {
  return ed25519.verify(signature, message, publicKey);
}

export function importEd25519PublicKey(base64: string): Uint8Array {
  return new Uint8Array(fromBase64(base64));
}

export function importEd25519PrivateKey(base64: string): Uint8Array {
  return new Uint8Array(fromBase64(base64));
}

export function exportEd25519PublicKey(key: Uint8Array): string {
  return toBase64(key.buffer as ArrayBuffer);
}

export function exportEd25519PrivateKey(key: Uint8Array): string {
  return toBase64(key);
}

// ─── Fingerprint ──────────────────────────────────────────────────────────

export async function computeFingerprintEd25519(
  publicKey: Uint8Array,
): Promise<string> {
  const hash = sha256(publicKey);
  return Array.from(hash)
    .map(b => b.toString(16).padStart(2, '0'))
    .join(':');
}

// ─── Safety Number (Signal-compatible) ─────────────────────────────────

const SAFETY_EMOJI = [
  '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼',
  '🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔',
  '🐧','🐦','🦆','🦅','🦉','🦇','🐺','🐗',
  '🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜',
  '🦟','🦗','🕷','🦂','🐢','🐍','🦎','🦖',
  '🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠',
  '🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆',
  '🦍','🦧','🐘','🦛','🦏','🐪','🐫','🦒',
];

export async function computeSafetyNumberX25519(
  localPublicKey: Uint8Array,
  remotePublicKey: Uint8Array,
  localUserId: string,
  remoteUserId: string,
): Promise<{ numeric: string; emoji: string[] }> {
  const [firstKey, secondKey, firstId, secondId] =
    localUserId < remoteUserId
      ? [localPublicKey, remotePublicKey, localUserId, remoteUserId]
      : [remotePublicKey, localPublicKey, remoteUserId, localUserId];

  const firstIdBuf = new TextEncoder().encode(firstId);
  const secondIdBuf = new TextEncoder().encode(secondId);

  const keyCmp = Buffer.from(firstKey).compare(Buffer.from(secondKey));
  const sortedKeys = keyCmp < 0 ? [firstKey, secondKey] : [secondKey, firstKey];

  const totalLen =
    firstIdBuf.byteLength + sortedKeys[0].length +
    secondIdBuf.byteLength + sortedKeys[1].length;
  const combined = new Uint8Array(totalLen);
  let offset = 0;
  combined.set(firstIdBuf, offset); offset += firstIdBuf.byteLength;
  combined.set(sortedKeys[0], offset); offset += sortedKeys[0].length;
  combined.set(secondIdBuf, offset); offset += secondIdBuf.byteLength;
  combined.set(sortedKeys[1], offset);

  const hash = sha256(combined);

  // FIX CRYPTO-4: Use SHA-512 (64 bytes) for 12×3=36 byte read.
  // crypto.subtle.digest uses OS crypto (fast, hardware-accelerated).
  const seedBuf = await crypto.subtle.digest('SHA-512', combined.buffer as ArrayBuffer);
  const seed = new Uint8Array(seedBuf);

  let numeric = '';
  for (let i = 0; i < 12; i++) {
    const byteIdx = i * 3;
    // Clamp: if past the 32-byte SHA-256, use zeros (matches "unknown bytes → 0")
    const b0 = byteIdx < seed.length ? seed[byteIdx] : 0;
    const b1 = byteIdx + 1 < seed.length ? seed[byteIdx + 1] : 0;
    const b2 = byteIdx + 2 < seed.length ? seed[byteIdx + 2] : 0;
    const val = ((b0 << 16) | (b1 << 8) | b2) % 100000;
    numeric += val.toString().padStart(5, '0');
  }

  const emoji: string[] = [];
  for (let i = 0; i < 8; i++) {
    emoji.push(SAFETY_EMOJI[hash[i] % 64]);
  }

  return { numeric, emoji };
}