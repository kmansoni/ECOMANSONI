/**
 * HardwareKeyStorage
 *
 * Priority: WebAuthn > Keychain > Keystore > IndexedDB/local fallback.
 *
 * NOTE: Capacitor plugins are loaded dynamically when available.
 */

import { authenticateWithBiometric, isBiometricAvailable } from './biometricUnlock';

export type HardwareStorageBackend = 'webauthn' | 'keychain' | 'keystore' | 'software';

export interface HardwareCapability {
  backend: HardwareStorageBackend;
  available: boolean;
}

export interface HardwareStoreRecord {
  keyId: string;
  wrappedKeyB64: string;
}

const SOFT_PREFIX = 'e2ee_hw_soft:';
const softMemoryStore = new Map<string, string>();

function softStoreSet(keyId: string, wrappedKeyB64: string): void {
  softMemoryStore.set(keyId, wrappedKeyB64);
  // Best-effort cleanup of legacy at-rest localStorage footprint.
  try {
    localStorage.removeItem(`${SOFT_PREFIX}${keyId}`);
  } catch {
    // Ignore storage unavailability.
  }
}

function softStoreGet(keyId: string): string | null {
  const inMemory = softMemoryStore.get(keyId);
  if (inMemory) return inMemory;

  // One-way migration from legacy localStorage to memory-only store.
  try {
    const legacy = localStorage.getItem(`${SOFT_PREFIX}${keyId}`);
    if (legacy) {
      softMemoryStore.set(keyId, legacy);
      localStorage.removeItem(`${SOFT_PREFIX}${keyId}`);
      return legacy;
    }
  } catch {
    // Ignore storage unavailability.
  }

  return null;
}

function softStoreRemove(keyId: string): void {
  softMemoryStore.delete(keyId);
  try {
    localStorage.removeItem(`${SOFT_PREFIX}${keyId}`);
  } catch {
    // Ignore storage unavailability.
  }
}

async function tryLoadCapacitorPlugin(name: string): Promise<any | null> {
  try {
    const mod = await import('@capacitor/core');
    const plugins = (mod as any).Plugins;
    if (plugins && plugins[name]) return plugins[name];
    return null;
  } catch {
    return null;
  }
}

export async function detectHardwareCapability(): Promise<HardwareCapability> {
  if (isBiometricAvailable()) {
    return { backend: 'webauthn', available: true };
  }

  const keychain = await tryLoadCapacitorPlugin('Keychain');
  if (keychain) return { backend: 'keychain', available: true };

  const secureStorage = await tryLoadCapacitorPlugin('SecureStoragePlugin');
  if (secureStorage) return { backend: 'keystore', available: true };

  return { backend: 'software', available: true };
}

export class HardwareKeyStorage {
  async getBackend(): Promise<HardwareStorageBackend> {
    const cap = await detectHardwareCapability();
    return cap.backend;
  }

  async put(record: HardwareStoreRecord): Promise<void> {
    const backend = await this.getBackend();

    if (backend === 'keychain') {
      const keychain = await tryLoadCapacitorPlugin('Keychain');
      if (keychain?.set) {
        await keychain.set({ key: record.keyId, value: record.wrappedKeyB64 });
        return;
      }
    }

    if (backend === 'keystore') {
      const secureStorage = await tryLoadCapacitorPlugin('SecureStoragePlugin');
      if (secureStorage?.set) {
        await secureStorage.set({ key: record.keyId, value: record.wrappedKeyB64 });
        return;
      }
    }

    softStoreSet(record.keyId, record.wrappedKeyB64);
  }

  async get(keyId: string): Promise<HardwareStoreRecord | null> {
    const backend = await this.getBackend();

    if (backend === 'keychain') {
      const keychain = await tryLoadCapacitorPlugin('Keychain');
      if (keychain?.get) {
        const res = await keychain.get({ key: keyId }).catch(() => null);
        if (res?.value) return { keyId, wrappedKeyB64: res.value };
      }
    }

    if (backend === 'keystore') {
      const secureStorage = await tryLoadCapacitorPlugin('SecureStoragePlugin');
      if (secureStorage?.get) {
        const res = await secureStorage.get({ key: keyId }).catch(() => null);
        if (res?.value) return { keyId, wrappedKeyB64: res.value };
      }
    }

    const soft = softStoreGet(keyId);
    if (!soft) return null;
    return { keyId, wrappedKeyB64: soft };
  }

  async remove(keyId: string): Promise<void> {
    const backend = await this.getBackend();

    if (backend === 'keychain') {
      const keychain = await tryLoadCapacitorPlugin('Keychain');
      if (keychain?.remove) {
        await keychain.remove({ key: keyId }).catch(() => undefined);
      }
    }

    if (backend === 'keystore') {
      const secureStorage = await tryLoadCapacitorPlugin('SecureStoragePlugin');
      if (secureStorage?.remove) {
        await secureStorage.remove({ key: keyId }).catch(() => undefined);
      }
    }

    softStoreRemove(keyId);
  }

  async biometricGate(timeoutMs = 30_000): Promise<boolean> {
    const result = await authenticateWithBiometric(undefined, { timeoutMs });
    return result.ok;
  }
}
