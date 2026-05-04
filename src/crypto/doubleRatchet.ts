// Double Ratchet implementation using libsodium-wrappers
import { sodium } from 'libsodium-wrappers';

export interface RatchetState {
  // Root key for future DH ratchets
  rootKey: Uint8Array;
  // Chain keys for sending and receiving
  sendChainKey: Uint8Array;
  recvChainKey: Uint8Array;
  // Message keys (derived from chain keys when needed)
  sendMessageKey: Uint8Array | null;
  recvMessageKey: Uint8Array | null;
  // Counters
  sendCount: number;
  recvCount: number;
  // Previous counter for handling out-of-order (max skipped messages)
  prevRecvCount: number;
}

/**
 * Initialize ratchet from shared secret (output of X3DH or subsequent DH)
 * @param sharedSecret - 32-byte shared secret from DH exchange
 */
export function initRatchet(sharedSecret: Uint8Array): RatchetState {
  await sodium.ready;
  // Ensure sharedSecret is 32 bytes
  if (sharedSecret.length !== 32) {
    throw new Error('Shared secret must be 32 bytes');
  }
  // Root key is the shared secret
  const rootKey = sharedSecret.slice();
  // Derive chain keys from root key
  const sendChainKey = sodium.crypto_kdf_derive_from_key(32, 1, sodium.fromHex('ratchet_send'), rootKey);
  const recvChainKey = sodium.crypto_kdf_derive_from_key(32, 2, sodium.fromHex('ratchet_recv'), rootKey);
  return {
    rootKey,
    sendChainKey,
    recvChainKey,
    sendMessageKey: null,
    recvMessageKey: null,
    sendCount: 0,
    recvCount: 0,
    prevRecvCount: 0,
  };
}

/**
 * Perform a DH ratchet step (when receiving a new DH public key from the other party)
 * This updates the root key and chain keys, and resets message keys and counters.
 * @param state - current ratchet state
 * @param dhSecret - 32-byte shared secret from DH exchange (our ephemeral private key * their ephemeral public key)
 * @returns new ratchet state
 */
export function dhRatchet(state: RatchetState, dhSecret: Uint8Array): RatchetState {
  await sodium.ready;
  if (dhSecret.length !== 32) {
    throw new Error('DH secret must be 32 bytes');
  }
  // newRootKey = KDF(rootKey, dhSecret, 0x00)
  const newRootKey = sodium.crypto_kdf_derive_from_key(32, 0, sodium.fromHex('ratchet_root'), state.rootKey);
  // new chain keys
  const newSendChainKey = sodium.crypto_kdf_derive_from_key(32, 1, sodium.fromHex('ratchet_send'), newRootKey);
  const newRecvChainKey = sodium.crypto_kdf_derive_from_key(32, 2, sodium.fromHex('ratchet_recv'), newRootKey);
  return {
    rootKey: newRootKey,
    sendChainKey: newSendChainKey,
    recvChainKey: newRecvChainKey,
    sendMessageKey: null,
    recvMessageKey: null,
    sendCount: 0,
    recvCount: 0,
    prevRecvCount: 0,
  };
}

/**
 * Generate a message key for sending (and advance the sending chain)
 * @param state - current ratchet state
 * @returns { messageKey: Uint8Array, newState: RatchetState } where newState has updated sendChainKey and incremented sendCount
 */
export function getMessageKey(state: RatchetState): { messageKey: Uint8Array; newState: RatchetState } {
  await sodium.ready;
  // Derive message key from sendChainKey with index = sendCount
  const messageKey = sodium.crypto_kdf_derive_from_key(32, state.sendCount, sodium.fromHex('message'), state.sendChainKey);
  // Advance send chain key for next message
  const nextSendChainKey = sodium.crypto_kdf_derive_from_key(32, 1, sodium.fromHex('ratchet_send'), state.sendChainKey);
  return {
    messageKey,
    newState: {
      ...state,
      sendChainKey: nextSendChainKey,
      sendMessageKey: messageKey,
      sendCount: state.sendCount + 1,
    }
  };
}

/**
 * Advance receiving chain to a given message index and return the message key.
 * If index is less than current recvCount, it's a repeat (should not happen if we track properly).
 * If index is greater than recvCount, we need to advance the chain and skip intermediate keys.
 * We'll skip up to a maximum (e.g., 1000) to prevent denial of service.
 * @param state - current ratchet state
 * @param index - the message index we want to retrieve (0-based)
 * @returns { key: Uint8Array, newState: RatchetState } where newState has updated recvChainKey, recvCount, prevRecvCount, and recvMessageKey set
 */
export function getMessageKeyAt(state: RatchetState, index: number): { key: Uint8Array; newState: RatchetState } {
  await sodium.ready;
  if (index < state.recvCount) {
    // We have already received this message (or we have skipped it). For simplicity, we return null or error.
    // In a full implementation we would have stored previous message keys in a cache.
    throw new Error('Message index already processed');
  }
  if (index - state.recvCount > 1000) {
    // Limit to prevent excessive skipping (DoS protection)
    throw new Error('Message gap too large');
  }
  // Advance the recv chain until we reach the desired index
  let chainKey = state.recvChainKey;
  let count = state.recvCount;
  while (count < index) {
    // Derive message key for this count (we don't need to store it, just advance chain)
    const _msgKey = sodium.crypto_kdf_derive_from_key(32, count, sodium.fromHex('message'), chainKey);
    // Advance chain key
    chainKey = sodium.crypto_kdf_derive_from_key(32, 1, sodium.fromHex('ratchet_recv'), chainKey);
    count++;
  }
  // Now chainKey is the chain key for index
  const messageKey = sodium.crypto_kdf_derive_from_key(32, index, sodium.fromHex('message'), chainKey);
  // Advance chain key for next message
  const nextRecvChainKey = sodium.crypto_kdf_derive_from_key(32, 1, sodium.fromHex('ratchet_recv'), chainKey);
  return {
    key: messageKey,
    newState: {
      ...state,
      recvChainKey: nextRecvChainKey,
      recvMessageKey: messageKey,
      recvCount: index + 1,
      prevRecvCount: index - state.recvCount, // number of messages skipped
    }
  };
}