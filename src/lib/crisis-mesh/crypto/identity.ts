/**
 * Crisis Mesh — Ed25519 identity + ECDH P-256 encryption keys.
 *
 * Ed25519: подпись envelope'ов, source of peerId (фингерпринт pub).
 * ECDH P-256: установка Double Ratchet сессий (см. `session.ts`).
 *
 * Persist:
 *   - Публичные метаданные (peerId, displayName, publicKey, ecdhPublicKey,
 *     createdAt) — в localStorage. Подделать можно, но все сообщения
 *     подписаны, так что bootstrap с чужой метой не даёт подделать
 *     отправителя: peerId вычисляется из publicKey, а приватного ключа у
 *     злоумышленника нет.
 *   - Приватные ключи (Ed25519 pkcs8 + ECDH pkcs8) — через HardwareKeyStorage:
 *     WebAuthn / Keychain / Keystore / software fallback (в памяти, без
 *     localStorage-следа).
 */

import { toBase64, fromBase64 } from '@/lib/e2ee/utils';
import { HardwareKeyStorage } from '@/lib/e2ee/hardwareKeyStorage';

import { type LocalIdentity, type PeerId, asPeerId } from '../types';

import {
  exportEcdhPrivateKey,
  generateEcdhKeyPair,
  importEcdhPrivateKey,
  importEcdhPublicKey,
  type EcdhKeyPair,
} from './ecdh-keys';

const IDENTITY_STORAGE_KEY = 'crisis-mesh:identity-v2';
const LEGACY_IDENTITY_STORAGE_KEY = 'crisis-mesh:identity-v1';
const ED25519_PRIVATE_KEY_ID = 'crisis-mesh:ed25519-priv';
const ECDH_PRIVATE_KEY_ID = 'crisis-mesh:ecdh-priv';

export interface IdentityKeyPair {
  publicKey: Uint8Array;
  privateKey: CryptoKey;
}

export interface LoadedIdentity {
  identity: LocalIdentity;
  ed25519PrivateKey: CryptoKey;
  ecdhPrivateKey: CryptoKey;
  ecdh: EcdhKeyPair;
}

export async function isEd25519Supported(): Promise<boolean> {
  try {
    await crypto.subtle.generateKey(
      { name: 'Ed25519' } as EcKeyGenParams,
      false,
      ['sign', 'verify'],
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Генерация нового Ed25519 identity keypair.
 * extractable=true — чтобы можно было экспортировать в pkcs8 для persist.
 * Безопасность: pkcs8 никогда не уходит в plain storage, только через
 * HardwareKeyStorage (WebAuthn/Keychain/Keystore/in-memory soft).
 */
export async function generateIdentityKeyPair(): Promise<IdentityKeyPair> {
  const keyPair = (await crypto.subtle.generateKey(
    { name: 'Ed25519' } as EcKeyGenParams,
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;

  const publicKeyBuf = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  return {
    publicKey: new Uint8Array(publicKeyBuf),
    privateKey: keyPair.privateKey,
  };
}

/**
 * Вычисление peerId как Base58(SHA-256(publicKey))[:12]
 * (результат ≈ 16 символов base58, удобно показывать в UI).
 */
export async function computePeerId(publicKey: Uint8Array): Promise<PeerId> {
  const hashBuf = await crypto.subtle.digest('SHA-256', publicKey as unknown as ArrayBuffer);
  const hash = new Uint8Array(hashBuf);
  const fingerprint = base58Encode(hash.subarray(0, 12));
  return asPeerId(fingerprint);
}

export async function importPublicKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    raw as unknown as ArrayBuffer,
    { name: 'Ed25519' } as EcKeyImportParams,
    true,
    ['verify'],
  );
}

async function exportEd25519PrivateKey(key: CryptoKey): Promise<string> {
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', key);
  return toBase64(new Uint8Array(pkcs8));
}

async function importEd25519PrivateKey(pkcs8B64: string): Promise<CryptoKey> {
  const bytes = new Uint8Array(fromBase64(pkcs8B64));
  return crypto.subtle.importKey(
    'pkcs8',
    bytes as unknown as ArrayBuffer,
    { name: 'Ed25519' } as EcKeyImportParams,
    true,
    ['sign'],
  );
}

export function storeIdentityMetadata(identity: LocalIdentity): void {
  const payload = {
    peerId: identity.peerId,
    displayName: identity.displayName,
    publicKey: toBase64(identity.publicKey),
    ecdhPublicKey: identity.ecdhPublicKey,
    createdAt: identity.createdAt,
  };
  try {
    localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(payload));
    localStorage.removeItem(LEGACY_IDENTITY_STORAGE_KEY);
  } catch {
    // Private mode / storage unavailable — identity живёт только эту сессию.
  }
}

export function loadIdentityMetadata(): LocalIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      peerId: string;
      displayName: string;
      publicKey: string;
      ecdhPublicKey: string;
      createdAt: number;
    };
    if (!parsed.ecdhPublicKey) return null;
    return {
      peerId: asPeerId(parsed.peerId),
      displayName: parsed.displayName,
      publicKey: new Uint8Array(fromBase64(parsed.publicKey)),
      ecdhPublicKey: parsed.ecdhPublicKey,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

async function persistPrivateKeys(
  ed25519PrivateKey: CryptoKey,
  ecdhPrivateKey: CryptoKey,
): Promise<void> {
  const storage = new HardwareKeyStorage();
  const [ed25519B64, ecdhB64] = await Promise.all([
    exportEd25519PrivateKey(ed25519PrivateKey),
    exportEcdhPrivateKey(ecdhPrivateKey),
  ]);
  await storage.put({ keyId: ED25519_PRIVATE_KEY_ID, wrappedKeyB64: ed25519B64 });
  await storage.put({ keyId: ECDH_PRIVATE_KEY_ID, wrappedKeyB64: ecdhB64 });
}

async function loadPrivateKeys(): Promise<{
  ed25519PrivateKey: CryptoKey;
  ecdhPrivateKey: CryptoKey;
} | null> {
  const storage = new HardwareKeyStorage();
  const [edRec, ecdhRec] = await Promise.all([
    storage.get(ED25519_PRIVATE_KEY_ID),
    storage.get(ECDH_PRIVATE_KEY_ID),
  ]);
  if (!edRec || !ecdhRec) return null;
  const [ed25519PrivateKey, ecdhPrivateKey] = await Promise.all([
    importEd25519PrivateKey(edRec.wrappedKeyB64),
    importEcdhPrivateKey(ecdhRec.wrappedKeyB64),
  ]);
  return { ed25519PrivateKey, ecdhPrivateKey };
}

export async function deleteIdentity(): Promise<void> {
  const storage = new HardwareKeyStorage();
  await Promise.all([
    storage.remove(ED25519_PRIVATE_KEY_ID),
    storage.remove(ECDH_PRIVATE_KEY_ID),
  ]);
  try {
    localStorage.removeItem(IDENTITY_STORAGE_KEY);
    localStorage.removeItem(LEGACY_IDENTITY_STORAGE_KEY);
  } catch {
    // Ignore storage unavailability.
  }
}

/**
 * Bootstrap: загружает существующую identity (если приватные ключи
 * восстановлены) или создаёт новую.
 *
 * Сценарии:
 *   1. Первый запуск: меты нет → генерация новой → persist.
 *   2. Повторный запуск, ключи есть в HardwareKeyStorage → восстановление.
 *   3. Мета есть, но ключи пропали (пользователь очистил storage) →
 *      генерация новой identity. PeerId сменится, пиры выполнят новый
 *      handshake, старые ratchet-сессии протухнут.
 */
export async function bootstrapIdentity(
  displayName: string,
): Promise<LoadedIdentity> {
  const existing = loadIdentityMetadata();

  if (existing) {
    const privateKeys = await loadPrivateKeys();
    if (privateKeys) {
      const ecdhPub = await importEcdhPublicKey(existing.ecdhPublicKey);
      const ecdh: EcdhKeyPair = {
        publicKey: ecdhPub,
        privateKey: privateKeys.ecdhPrivateKey,
        publicKeyB64: existing.ecdhPublicKey,
      };
      return {
        identity: existing,
        ed25519PrivateKey: privateKeys.ed25519PrivateKey,
        ecdhPrivateKey: privateKeys.ecdhPrivateKey,
        ecdh,
      };
    }
    // Мета есть, ключей нет — удаляем мету, генерируем всё заново.
    try {
      localStorage.removeItem(IDENTITY_STORAGE_KEY);
    } catch {
      // Ignore.
    }
  }

  const ed25519 = await generateIdentityKeyPair();
  const ecdh = await generateEcdhKeyPair();
  const peerId = await computePeerId(ed25519.publicKey);

  const identity: LocalIdentity = {
    peerId,
    displayName,
    publicKey: ed25519.publicKey,
    ecdhPublicKey: ecdh.publicKeyB64,
    createdAt: Date.now(),
  };

  await persistPrivateKeys(ed25519.privateKey, ecdh.privateKey);
  storeIdentityMetadata(identity);

  return {
    identity,
    ed25519PrivateKey: ed25519.privateKey,
    ecdhPrivateKey: ecdh.privateKey,
    ecdh,
  };
}

// ─── Base58 (Bitcoin alphabet) ───────────────────────────────────────────────

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';

  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;

  let num = 0n;
  for (const b of bytes) num = num * 256n + BigInt(b);

  let result = '';
  while (num > 0n) {
    const rem = Number(num % 58n);
    result = BASE58_ALPHABET[rem] + result;
    num = num / 58n;
  }

  for (let i = 0; i < zeros; i++) result = '1' + result;

  return result;
}

export function base58Decode(str: string): Uint8Array {
  if (str.length === 0) return new Uint8Array(0);

  let zeros = 0;
  while (zeros < str.length && str[zeros] === '1') zeros++;

  let num = 0n;
  for (const ch of str) {
    const idx = BASE58_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`invalid base58 char: ${ch}`);
    num = num * 58n + BigInt(idx);
  }

  const bytes: number[] = [];
  while (num > 0n) {
    bytes.unshift(Number(num & 0xffn));
    num = num >> 8n;
  }

  const result = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < bytes.length; i++) result[zeros + i] = bytes[i];
  return result;
}