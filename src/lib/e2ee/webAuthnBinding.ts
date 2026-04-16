/**
 * WebAuthn / PRF Binding для E2EE ключей
 *
 * Привязывает IndexedDB ключи к аппаратному WebAuthn токену через расширение PRF
 * (draft-hodges-webauthn-prf-00). PRF-вывод используется как entropy для wrapping
 * identity private key.
 *
 * Протокол:
 *   Registration:
 *     1. navigator.credentials.create() + prf eval → prfOutput (32 bytes)
 *     2. HKDF(prfOutput, salt) → wrapKey (AES-GCM 256)
 *     3. AES-GCM-wrap(wrapKey, identityPrivateKey) → encryptedBlob
 *     4. Store { credentialId, encryptedBlob, salt, iv } in IndexedDB
 *
 *   Unlock:
 *     1. navigator.credentials.get() + prf eval → prfOutput
 *     2. HKDF(prfOutput, salt) → wrapKey
 *     3. AES-GCM-unwrap(wrapKey, encryptedBlob) → identityPrivateKey
 *
 * Fallback: wenn PRF extension не поддержан → PBKDF2 (existierender deriveMasterKey path)
 */

import { fromBase64, toBase64 } from './utils';

// ─── Типы ────────────────────────────────────────────────────────────────────

export interface WebAuthnCredentialRecord {
  credentialId: string;        // base64url
  encryptedKeyBlob: string;    // base64 ciphertext
  iv: string;                  // base64 12-byte GCM nonce
  salt: string;                // base64 32-byte HKDF salt
  userId: string;
  createdAt: number;
}

export interface WebAuthnBindingResult {
  credentialId: string;
  wrapKey: CryptoKey;          // non-extractable AES-GCM derived from PRF
}

export interface PRFExtensionOutput {
  first: ArrayBuffer;   // 32 bytes
  second?: ArrayBuffer;
}

// Selector for IDB storage of credential records
const IDB_STORE = 'webauthn_creds';
const IDB_DB    = 'e2ee-webauthn';

// ─── PRF Availability Check ──────────────────────────────────────────────────

/**
 * Best-effort проверка того, что браузер поддерживает WebAuthn API,
 * на котором теоретически может работать PRF extension.
 *
 * ВАЖНО: это НЕ гарантирует реальную поддержку PRF — спецификация не даёт
 * способа проверить её без попытки создания credential с
 * `extensions: { prf: {} }` и анализа `getClientExtensionResults().prf`.
 * Такая проверка требует взаимодействия с пользователем и potential user-visible
 * prompt, поэтому здесь проверяем только наличие `PublicKeyCredential`.
 *
 * Используется как быстрый gate перед более дорогими операциями;
 * реальное отсутствие PRF выявится позже при попытке registerWebAuthnBinding.
 *
 * Возвращает false в SSR / no-WebAuthn средах (Safari <13, Firefox без WebAuthn).
 */
export function isWebAuthnPRFSupported(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') {
    return false;
  }
  return (
    typeof navigator.credentials === 'object' &&
    typeof window.PublicKeyCredential === 'function'
  );
}

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Регистрирует новый WebAuthn credential c PRF-extension.
 * Оборачивает (wraps) identityPrivateKey через AES-GCM с PRF-derived key.
 *
 * @param userId              Supabase user UUID
 * @param identityPrivateKey  non-extractable CryptoKey (ECDH)
 * @param rpId                Relying Party ID (window.location.hostname)
 */
export async function registerWebAuthnBinding(
  userId: string,
  identityPrivateKey: CryptoKey,
  rpId?: string,
): Promise<WebAuthnCredentialRecord> {
  const relyingPartyId = rpId ?? window.location.hostname;

  // PRF eval seed — deterministic input so we can reproduce on unlock
  const prfSeed = new Uint8Array(32);
  crypto.getRandomValues(prfSeed);
  const salt = new Uint8Array(32);
  crypto.getRandomValues(salt);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  // ── Build create options ──────────────────────────────────────────────────
  const createOptions: PublicKeyCredentialCreationOptions = {
    rp: { id: relyingPartyId, name: 'Your AI Companion' },
    user: {
      id: new TextEncoder().encode(userId),
      name: userId,
      displayName: userId,
    },
    challenge,
    pubKeyCredParams: [
      { type: 'public-key', alg: -7  },  // ES256 (ECDSA P-256)
      { type: 'public-key', alg: -257 }, // RS256 fallback
    ],
    authenticatorSelection: {
      userVerification: 'required',
      residentKey: 'preferred',
    },
    extensions: {
      prf: {
        eval: {
          first: prfSeed.buffer as ArrayBuffer,
        },
      },
    } as AuthenticationExtensionsClientInputs,
    timeout: 60_000,
  };

  let credential: PublicKeyCredential;
  try {
    credential = (await navigator.credentials.create({
      publicKey: createOptions,
    })) as PublicKeyCredential;
  } catch (err: unknown) {
    throw new Error(`WebAuthn registration failed: ${(err as Error).message}`);
  }

  // ── Extract PRF output ────────────────────────────────────────────────────
  const ext = (credential.getClientExtensionResults() as any);
  const prfResult: PRFExtensionOutput | undefined = ext?.prf?.results;

  if (!prfResult?.first) {
    throw new Error(
      'WebAuthn PRF extension not supported by this authenticator. ' +
      'Use PBKDF2 passphrase fallback instead.',
    );
  }

  // ── Wrap identity private key ─────────────────────────────────────────────
  // NOTE: identityPrivateKey must have 'sign' or 'deriveKey/deriveBits' usage; we
  // need it to be extractable for wrapping OR use AES-GCM encrypt on PKCS8 export.
  // Strategy: export to pkcs8 bytes, then AES-GCM encrypt (works for non-extractable = false).
  let privateKeyBytes: ArrayBuffer;
  try {
    privateKeyBytes = await crypto.subtle.exportKey('pkcs8', identityPrivateKey);
  } catch {
    // Key is non-extractable — re-keying needed; caller must provide extractable copy
    throw new Error(
      'identityPrivateKey is non-extractable. ' +
      'Pass extractable: true during initial key generation to enable WebAuthn wrapping.',
    );
  }

  // Encrypt PKCS8 bytes with HKDF-derived AES-GCM key
  const wrappedPrivateKey = await deriveAndWrap(prfResult.first, salt.buffer as ArrayBuffer, iv, privateKeyBytes);

  const credentialIdBase64 = toBase64(credential.rawId);

  const record: WebAuthnCredentialRecord = {
    credentialId: credentialIdBase64,
    encryptedKeyBlob: toBase64(wrappedPrivateKey),
    iv: toBase64(iv.buffer as ArrayBuffer),
    salt: toBase64(salt.buffer as ArrayBuffer),
    userId,
    createdAt: Date.now(),
  };

  // Persist credential seed alongside record so we can reproduce PRF on unlock
  await persistCredentialRecord(record, prfSeed);

  return record;
}

/** Derive encryption key + encrypt PKCS8 bytes in one step, avoiding exportKey on wrapKey */
async function deriveAndWrap(
  prfOutput: ArrayBuffer,
  salt: ArrayBuffer,
  iv: Uint8Array,
  plaintext: ArrayBuffer,
): Promise<ArrayBuffer> {
  const ikm = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveKey']);
  const encKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: new TextEncoder().encode('e2ee-webauthn-wrapkey-v1'),
    },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as unknown as Uint8Array<ArrayBuffer> }, encKey, plaintext);
}

/** Derive decryption key + decrypt */
async function deriveAndUnwrap(
  prfOutput: ArrayBuffer,
  salt: ArrayBuffer,
  iv: ArrayBuffer,
  ciphertext: ArrayBuffer,
): Promise<ArrayBuffer> {
  const ikm = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveKey']);
  const decKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: new TextEncoder().encode('e2ee-webauthn-wrapkey-v1'),
    },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, decKey, ciphertext);
}

// ─── Unlock (Authentication) ──────────────────────────────────────────────────

/**
 * Разблокирует identity private key через WebAuthn PRF.
 * Возвращает восстановленный CryptoKey (non-extractable ECDH P-256).
 *
 * @param record  StoredWebAuthnCredentialRecord from IDB
 * @param rpId    Relying Party ID
 */
export async function unlockWithWebAuthn(
  record: WebAuthnCredentialRecord,
  rpId?: string,
): Promise<CryptoKey> {
  const relyingPartyId = rpId ?? window.location.hostname;

  const prfSeed = await loadCredentialSeed(record.credentialId);
  if (!prfSeed) throw new Error('WebAuthn credential seed not found in local storage');

  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  const getOptions: PublicKeyCredentialRequestOptions = {
    rpId: relyingPartyId,
    challenge,
    allowCredentials: [{
      type: 'public-key',
      id: fromBase64(record.credentialId),
    }],
    userVerification: 'required',
    extensions: {
      prf: {
        eval: {
          first: prfSeed,
        },
      },
    } as AuthenticationExtensionsClientInputs,
    timeout: 60_000,
  };

  let assertion: PublicKeyCredential;
  try {
    assertion = (await navigator.credentials.get({ publicKey: getOptions })) as PublicKeyCredential;
  } catch (err: unknown) {
    throw new Error(`WebAuthn authentication failed: ${(err as Error).message}`);
  }

  const ext = (assertion.getClientExtensionResults() as any);
  const prfResult: PRFExtensionOutput | undefined = ext?.prf?.results;

  if (!prfResult?.first) {
    throw new Error('PRF extension output missing during authentication');
  }

  // Decrypt wrapped private key
  const saltBuf = fromBase64(record.salt);
  const ivBuf = fromBase64(record.iv);
  const ciphertextBuf = fromBase64(record.encryptedKeyBlob);

  const privateKeyBytes = await deriveAndUnwrap(prfResult.first, saltBuf, ivBuf, ciphertextBuf);

  // Re-import as non-extractable ECDH private key
  return crypto.subtle.importKey(
    'pkcs8',
    privateKeyBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, // non-extractable after unlock
    ['deriveKey', 'deriveBits'],
  );
}

// ─── IDB Persistence Helpers ─────────────────────────────────────────────────

function openWebAuthnDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'credentialId' });
      }
      if (!db.objectStoreNames.contains('seeds')) {
        db.createObjectStore('seeds', { keyPath: 'credentialId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function persistCredentialRecord(
  record: WebAuthnCredentialRecord,
  prfSeed: Uint8Array,
): Promise<void> {
  const db = await openWebAuthnDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([IDB_STORE, 'seeds'], 'readwrite');
    tx.objectStore(IDB_STORE).put(record);
    tx.objectStore('seeds').put({ credentialId: record.credentialId, seed: prfSeed });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function loadCredentialSeed(credentialId: string): Promise<ArrayBuffer | null> {
  const db = await openWebAuthnDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('seeds', 'readonly');
    const req = tx.objectStore('seeds').get(credentialId);
    req.onsuccess = () => {
      db.close();
      resolve((req.result as { seed: ArrayBuffer } | undefined)?.seed ?? null);
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

/**
 * Загружает запись WebAuthn credentials для userId из IDB.
 */
export async function loadWebAuthnRecord(userId: string): Promise<WebAuthnCredentialRecord | null> {
  const db = await openWebAuthnDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      db.close();
      const all = (req.result as WebAuthnCredentialRecord[]) ?? [];
      resolve(all.find((r) => r.userId === userId) ?? null);
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

/**
 * Удаляет WebAuthn binding для credentials.
 */
export async function removeWebAuthnBinding(credentialId: string): Promise<void> {
  const db = await openWebAuthnDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([IDB_STORE, 'seeds'], 'readwrite');
    tx.objectStore(IDB_STORE).delete(credentialId);
    tx.objectStore('seeds').delete(credentialId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
