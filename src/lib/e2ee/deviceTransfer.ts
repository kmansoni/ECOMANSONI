/**
 * Device Transfer — Secure identity key migration to a new device
 *
 * Protocol:
 * 1. Source device generates an ephemeral ECDH transfer key pair (P-256)
 * 2. Source creates a QR-code-ready transfer token (base64url ephemeral public key)
 * 3. Target device scans QR code, generates its own ECDH pair
 * 4. Target sends back its ephemeral public key (via Supabase Realtime / signaling channel)
 * 5. Source computes ECDH shared secret → HKDF → AES-256-GCM transfer key
 * 6. Source encrypts the identity private key (PKCS8) and signs the package with identity key
 * 7. Target receives package, computes same shared secret, decrypts, verifies signature
 * 8. Target reimports private key as non-extractable
 *
 * Transfer package format:
 * {
 *   v: 1,
 *   sourceEphemeralPublicKey: string,  // base64 SPKI
 *   targetEphemeralPublicKey: string,  // base64 SPKI (added by target before encryption)
 *   iv: string,                        // base64 12-byte AES-GCM nonce
 *   ciphertext: string,                // base64 AES-GCM encrypted PKCS8 private key
 *   signature: string,                 // base64 ECDSA-P256 signature over ciphertext||iv
 *   timestamp: number,                 // Unix ms — transfer expires in 5 min
 * }
 */

import { toBase64, fromBase64 } from './utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TransferToken {
  /** Base64url ephemeral public key SPKI — put this in a QR code */
  token: string;
  /** Internal ephemeral ECDH key pair — keep on source device */
  _ephemeralKeyPair: CryptoKeyPair;
  /** Unix ms when this token was created */
  createdAt: number;
  /** Token expires after 5 minutes */
  expiresAt: number;
}

export interface TransferPackage {
  v: 1;
  sourceEphemeralPublicKey: string; // base64 SPKI
  targetEphemeralPublicKey: string; // base64 SPKI
  iv: string;
  ciphertext: string;
  signature: string;
  timestamp: number;
}

const TRANSFER_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Step 1: Source device — initiate transfer ────────────────────────────────

/**
 * Called on the SOURCE device.
 * Generates an ephemeral ECDH key pair and returns a QR-code-ready token.
 * Keep the returned `_ephemeralKeyPair` in memory until `sealTransferPackage` is called.
 */
export async function initiateTransfer(): Promise<TransferToken> {
  const ephemeralKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true, // extractable so we can export the public key for QR
    ['deriveKey'],
  );

  const pubSpki = await crypto.subtle.exportKey('spki', ephemeralKeyPair.publicKey);

  const createdAt = Date.now();
  return {
    token: toBase64(pubSpki), // base64 SPKI → QR code payload
    _ephemeralKeyPair: ephemeralKeyPair,
    createdAt,
    expiresAt: createdAt + TRANSFER_TTL_MS,
  };
}

// ─── Step 2: Target device — accept transfer ──────────────────────────────────

/**
 * Called on the TARGET device after scanning QR code.
 * Returns { targetPublicKeyBase64 } to send back to source, and keeps the private key.
 */
export async function acceptTransfer(transferToken: string): Promise<{
  targetPublicKeyBase64: string;
  _targetKeyPair: CryptoKeyPair;
  _sourcePubKey: CryptoKey;
}> {
  const sourcePubSpki = fromBase64(transferToken);
  const sourcePubKey = await crypto.subtle.importKey(
    'spki',
    sourcePubSpki,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  const targetKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey'],
  );

  const targetPubSpki = await crypto.subtle.exportKey('spki', targetKeyPair.publicKey);
  return {
    targetPublicKeyBase64: toBase64(targetPubSpki),
    _targetKeyPair: targetKeyPair,
    _sourcePubKey: sourcePubKey,
  };
}

// ─── ECDH + HKDF shared key derivation ───────────────────────────────────────

async function deriveTransferKey(
  privateKey: CryptoKey,
  peerPublicKey: CryptoKey,
  context: string,
): Promise<CryptoKey> {
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: peerPublicKey },
    privateKey,
    256,
  );

  // HKDF: info = "device-transfer" + context
  const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: new TextEncoder().encode(`device-transfer:${context}`),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ─── Step 3: Source device — seal the package ─────────────────────────────────

/**
 * Called on the SOURCE device after receiving target's ephemeral public key.
 *
 * @param identityPrivateKey  Must be extractable (or use a copy for transfer only)
 * @param identitySigningKey  ECDSA P-256 private key for signing the package
 * @param transferToken       From `initiateTransfer()`
 * @param targetPublicKeyBase64  From `acceptTransfer()` on target device
 */
export async function sealTransferPackage(
  identityPrivateKey: CryptoKey,
  identitySigningKey: CryptoKey,
  transferToken: TransferToken,
  targetPublicKeyBase64: string,
): Promise<TransferPackage> {
  if (Date.now() > transferToken.expiresAt) {
    throw new Error('Transfer token expired. Generate a new QR code.');
  }

  // Import target's ephemeral public key
  const targetPubKey = await crypto.subtle.importKey(
    'spki',
    fromBase64(targetPublicKeyBase64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  // Derive transfer AES key via ECDH(source_ephemeral_private, target_ephemeral_public)
  const transferAesKey = await deriveTransferKey(
    transferToken._ephemeralKeyPair.privateKey,
    targetPubKey,
    'seal',
  );

  // Export identity private key
  let pkcs8Bytes: ArrayBuffer;
  try {
    pkcs8Bytes = await crypto.subtle.exportKey('pkcs8', identityPrivateKey);
  } catch {
    throw new Error('identityPrivateKey must be extractable for device transfer.');
  }

  // Encrypt
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    transferAesKey,
    pkcs8Bytes,
  );

  // Sign: ECDSA over ciphertext || iv
  const signPayload = new Uint8Array(ciphertextBuf.byteLength + 12);
  signPayload.set(new Uint8Array(ciphertextBuf), 0);
  signPayload.set(iv, ciphertextBuf.byteLength);

  const sigBuf = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    identitySigningKey,
    signPayload,
  );

  return {
    v: 1,
    sourceEphemeralPublicKey: transferToken.token,
    targetEphemeralPublicKey: targetPublicKeyBase64,
    iv: toBase64(iv.buffer as ArrayBuffer),
    ciphertext: toBase64(ciphertextBuf),
    signature: toBase64(sigBuf),
    timestamp: Date.now(),
  };
}

// ─── Step 4: Target device — open the package ──────────────────────────────────

/**
 * Called on the TARGET device.
 *
 * @param pkg              The sealed package from source
 * @param targetKeyPair    From `acceptTransfer()` on target device
 * @param identityVerifyKey  ECDSA P-256 public key of the owner (fetch from server or trust-on-first-use)
 * @returns non-extractable ECDH P-256 identity private key
 */
export async function openTransferPackage(
  pkg: TransferPackage,
  targetKeyPair: CryptoKeyPair,
  identityVerifyKey: CryptoKey,
): Promise<CryptoKey> {
  if (Date.now() > pkg.timestamp + TRANSFER_TTL_MS) {
    throw new Error('Transfer package expired.');
  }

  // Import source ephemeral public key
  const sourcePubKey = await crypto.subtle.importKey(
    'spki',
    fromBase64(pkg.sourceEphemeralPublicKey),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  // Derive the same transfer AES key
  const transferAesKey = await deriveTransferKey(
    targetKeyPair.privateKey,
    sourcePubKey,
    'seal', // must match what source used
  );

  // Verify signature before decrypting
  const ciphertextBuf = fromBase64(pkg.ciphertext);
  const ivBuf = fromBase64(pkg.iv);
  const signPayload = new Uint8Array(ciphertextBuf.byteLength + 12);
  signPayload.set(new Uint8Array(ciphertextBuf), 0);
  signPayload.set(new Uint8Array(ivBuf), ciphertextBuf.byteLength);

  const sigValid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    identityVerifyKey,
    fromBase64(pkg.signature),
    signPayload,
  );
  if (!sigValid) {
    throw new Error('Transfer package signature verification failed. Possible tampering.');
  }

  // Decrypt
  const pkcs8Bytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuf },
    transferAesKey,
    ciphertextBuf,
  ).catch(() => {
    throw new Error('Transfer package decryption failed.');
  });

  // Import as non-extractable
  return crypto.subtle.importKey(
    'pkcs8',
    pkcs8Bytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey', 'deriveBits'],
  );
}
