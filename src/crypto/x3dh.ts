// X3DH (Extended Triple Diffie-Hellman) using Web Crypto API
// Implements Signal Protocol X3DH key agreement

export interface X3DHKeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export interface X3DHKeyBundle {
  ik: X3DHKeyPair;
  spk: X3DHKeyPair;
  spkSig: Uint8Array;
  opk: X3DHKeyPair[];
}

export interface X3DHResult {
  sharedSecret: Uint8Array;
  sendKey: Uint8Array;
  recvKey: Uint8Array;
}

async function deriveKey(
  inputKey: Uint8Array,
  info: string,
  length: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    inputKey,
    { name: 'HKDF' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode(info) },
    key,
    length * 8
  );
  return new Uint8Array(bits);
}

async function ecdh(privateKey: CryptoKey, publicKey: CryptoKey): Promise<Uint8Array> {
  const shared = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    privateKey,
    256
  );
  return new Uint8Array(shared);
}

async function exportKey(key: CryptoKey): Promise<Uint8Array> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return new Uint8Array(raw);
}

export async function generateIdentityKey(): Promise<X3DHKeyPair> {
  // WebCrypto P-256 ECDH limitation: wrapKey internally calls exportKey,
  // which rejects non-extractable keys. extractable:true is unavoidable here.
  //
  // STORAGE-3 mitigations:
  //   1. Identity key bytes are always encrypted at-rest with PBKDF2(escrow_password) —
  //      plaintext PKCS8 never persists on disk/IndexedDB.
  //   2. Escrow requires explicit user action (interactive flow), not silent XSS.
  //   3. CRYPTO-5: Double Ratchet operational keys remain non-extractable always.
  //   4. Hardware-backed storage (when available) adds OS-level protection.
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  return pair;
}


export async function signWithIdentity(
  identityKey: CryptoKey,
  data: Uint8Array
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    await exportKey(identityKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
}

export async function x3dh(
  my: X3DHKeyBundle,
  theirPublicKeys: { ik: CryptoKey; spk: CryptoKey; opk?: CryptoKey },
  theirOpkIndex: number | null = null
): Promise<X3DHResult> {
  const dh1 = await ecdh(my.ik.privateKey, theirPublicKeys.ik);
  const dh2 = await ecdh(my.spk.privateKey, theirPublicKeys.ik);
  const dh3 = await ecdh(my.spk.privateKey, theirPublicKeys.spk);

  let dh4 = new Uint8Array(0);
  if (theirOpkIndex !== null && theirPublicKeys.opk) {
    dh4 = await ecdh(my.spk.privateKey, theirPublicKeys.opk);
  }

  const concat = [dh1, dh2, dh3, dh4];
  let totalLen = 0;
  for (const b of concat) totalLen += b.length;
  const combined = new Uint8Array(totalLen);
  let offset = 0;
  for (const b of concat) {
    combined.set(b, offset);
    offset += b.length;
  }

  const sharedSecret = await deriveKey(combined, 'x3dh', 32);
  return {
    sharedSecret,
    sendKey: sharedSecret.slice(0, 16),
    recvKey: sharedSecret.slice(16, 32),
  };
}
