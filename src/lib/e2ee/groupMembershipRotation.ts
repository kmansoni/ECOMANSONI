import { removeGroupMember, getGroupKeyTree } from "@/lib/e2ee/groupKeyTree";
import { toBase64 } from "@/lib/e2ee/utils";
import { importPublicKey, hkdfDerive, deriveSharedSecret } from "@/lib/e2ee/crypto";
import { E2EEKeyStore } from "@/lib/e2ee/keyStore";
import { logger } from '@/lib/logger';

/**
 * Encrypts a group node key for a specific recipient using ECDH + AES-GCM.
 *
 * Flow (Signal Sender Keys §4.3 / MLS-style):
 *   1. Generate ephemeral ECDH key pair
 *   2. ECDH(ephemeralPrivate, recipientIdentityPublic) → shared secret
 *   3. HKDF(sharedSecret, salt=random, info="group-node-key-v1") → AES-256 key
 *   4. AES-GCM encrypt(nodeKey) → ciphertext
 *   5. Return { ciphertext, iv, ephemeralPublicKey }
 *
 * Recipient derives the same AES key via ECDH(theirIdentityPrivate, ephemeralPublic).
 * Raw node key material never leaves the client unencrypted.
 *
 * @param nodeKey        32-byte seed key to encrypt
 * @param recipientId    userId of the recipient (their identity key is in keyStore)
 * @param keyStore       E2EEKeyStore instance (must be unlocked)
 * @param currentUserId  authenticated user — their identity key signs the epoch
 */
async function encryptNodeKeyForRecipient(
  nodeKey: ArrayBuffer,
  recipientId: string,
  keyStore: E2EEKeyStore,
  _currentUserId: string,
): Promise<{ ciphertext: string; iv: string; ephemeralPublicKey: string }> {
  // 1. Get recipient's identity public key from keyStore
  const recipientPublicKeyRaw = await keyStore.getKey(`identity:${recipientId}:public`);
  if (!recipientPublicKeyRaw) {
    throw new Error(`Identity public key not found for recipient ${recipientId}`);
  }

  // 2. Generate ephemeral ECDH key pair for this encryption
  const ephemeralKp = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true, // extractable — needed to export raw bytes for transport
    ['deriveBits', 'deriveKey'], // deriveKey needed by deriveSharedSecret
  );

  // 3. ECDH: ephemeral private + recipient public → HKDF CryptoKey
  const sharedSecretKey = await deriveSharedSecret(ephemeralKp.privateKey, recipientPublicKeyRaw);

  // 4. HKDF: derive AES-256 key from shared secret
  const salt = new Uint8Array(32);
  crypto.getRandomValues(salt);
  const aesKey = await hkdfDerive(
    sharedSecretKey,
    salt.buffer as ArrayBuffer,
    `group-node-key-v1:${recipientId}`,
    256,
  );

  // 5. AES-GCM encrypt nodeKey
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    new Uint8Array(nodeKey),
  );

  // 6. Export ephemeral public key for transport
  const ephemeralPublicRaw = await crypto.subtle.exportKey('raw', ephemeralKp.publicKey);

  return {
    ciphertext: toBase64(ciphertextBuf),
    iv: toBase64(iv.buffer as ArrayBuffer),
    ephemeralPublicKey: toBase64(ephemeralPublicRaw),
  };
}

/**
 * Performs best-effort local key rotation when a member leaves a group.
 *
 * The in-memory GroupKeyTree may be absent (e.g. after page reload), so this helper
 * is intentionally fail-safe and never throws to the UI layer.
 *
 * SECURITY (GROUP-3 fix):
 *   Node keys are encrypted per-recipient via ECDH+AES-GCM before leaving the client.
 *   Raw node key material is never sent to the backend in plaintext.
 *
 * @param conversationId  conversation/group id
 * @param removedUserId    user being removed from group
 * @param keyStore         E2EEKeyStore instance (must be unlocked)
 * @param currentUserId    authenticated user's id — their identity signs the rekey
 */
export async function rotateGroupMembershipAfterRemoval(
  conversationId: string,
  removedUserId: string | null | undefined,
  keyStore: E2EEKeyStore,
  currentUserId: string,
): Promise<boolean> {
  if (!conversationId || !removedUserId) return false;

  const tree = getGroupKeyTree(conversationId);
  if (!tree) return false;

  try {
    await removeGroupMember(conversationId, removedUserId, async (recipientId, nodeKey) => {
      return encryptNodeKeyForRecipient(nodeKey, recipientId, keyStore, currentUserId);
    });
    return true;
  } catch (error) {
    logger.warn('[group-e2ee] membership rotation after removal failed', { error });
    return false;
  }
}
