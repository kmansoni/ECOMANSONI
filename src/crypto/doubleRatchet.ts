// Double Ratchet implementation using Web Crypto API
// Signal Protocol — Double Ratchet with AES-256-GCM

export interface RatchetState {
  rootKey: Uint8Array;
  sendChainKey: Uint8Array;
  recvChainKey: Uint8Array;
  sendMessageKey: Uint8Array | null;
  recvMessageKey: Uint8Array | null;
  sendCount: number;
  recvCount: number;
  prevRecvCount: number;
}

async function deriveKey(parent: Uint8Array, info: string, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw', parent,
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

async function kdf(parent: Uint8Array, name: string, id: number): Promise<Uint8Array> {
  return deriveKey(parent, `${name}:${id}`, 32);
}

export async function initRatchet(sharedSecret: Uint8Array): Promise<RatchetState> {
  if (sharedSecret.length !== 32) {
    throw new Error('Shared secret must be 32 bytes');
  }
  const rootKey = sharedSecret.slice();
  return {
    rootKey,
    sendChainKey: await kdf(rootKey, 'ratchet_send', 1),
    recvChainKey: await kdf(rootKey, 'ratchet_recv', 2),
    sendMessageKey: null,
    recvMessageKey: null,
    sendCount: 0,
    recvCount: 0,
    prevRecvCount: 0,
  };
}

export async function dhRatchet(state: RatchetState, dhSecret: Uint8Array): Promise<RatchetState> {
  if (dhSecret.length !== 32) {
    throw new Error('DH secret must be 32 bytes');
  }
  const newRootKey = await kdf(state.rootKey, 'ratchet_root', 0);
  return {
    rootKey: newRootKey,
    sendChainKey: await kdf(newRootKey, 'ratchet_send', 1),
    recvChainKey: await kdf(newRootKey, 'ratchet_recv', 2),
    sendMessageKey: null,
    recvMessageKey: null,
    sendCount: 0,
    recvCount: 0,
    prevRecvCount: 0,
  };
}

export async function getMessageKey(state: RatchetState): Promise<{ messageKey: Uint8Array; newState: RatchetState }> {
  const messageKey = await kdf(state.sendChainKey, 'message', state.sendCount);
  const nextSendChainKey = await kdf(state.sendChainKey, 'ratchet_send', 1);
  return {
    messageKey,
    newState: {
      ...state,
      sendChainKey: nextSendChainKey,
      sendMessageKey: messageKey,
      sendCount: state.sendCount + 1,
    },
  };
}

export async function getMessageKeyAt(state: RatchetState, index: number): Promise<{ key: Uint8Array; newState: RatchetState }> {
  if (index < state.recvCount) {
    throw new Error('Message index already processed');
  }
  if (index - state.recvCount > 1000) {
    throw new Error('Message gap too large');
  }
  let chainKey = state.recvChainKey;
  let count = state.recvCount;
  while (count < index) {
    chainKey = await kdf(chainKey, 'ratchet_recv', 1);
    count++;
  }
  const messageKey = await kdf(chainKey, 'message', index);
  const nextRecvChainKey = await kdf(chainKey, 'ratchet_recv', 1);
  return {
    key: messageKey,
    newState: {
      ...state,
      recvChainKey: nextRecvChainKey,
      recvMessageKey: messageKey,
      recvCount: index + 1,
      prevRecvCount: index - state.recvCount,
    },
  };
}

export async function encryptMessage(
  state: RatchetState,
  plaintext: Uint8Array
): Promise<{ ciphertext: Uint8Array; newState: RatchetState }> {
  const { messageKey, newState } = await getMessageKey(state);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', messageKey, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return { ciphertext: new Uint8Array(ciphertext), newState };
}

export async function decryptMessage(
  state: RatchetState,
  ciphertext: Uint8Array,
  iv: Uint8Array
): Promise<{ plaintext: Uint8Array; newState: RatchetState }> {
  const { key, newState } = await getMessageKeyAt(state, state.recvCount);
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertext);
  return { plaintext: new Uint8Array(plaintext), newState };
}
