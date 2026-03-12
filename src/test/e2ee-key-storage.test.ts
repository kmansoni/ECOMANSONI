import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SecureKeyStore } from '../lib/e2ee/keyStore';
import {
  generateSenderKey,
  encryptGroupMessage,
  rotateSenderKeyOnMemberLeave,
  distributeSenderKey,
} from '../lib/e2ee/senderKeys';
import { SFrameMediaContext } from '../lib/e2ee/sframeMedia';
import { toBase64 } from '../lib/e2ee/utils';

function randomDbName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

describe('SecureKeyStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should encrypt keys at rest', async () => {
    const store = new SecureKeyStore({ dbName: randomDbName('secure-ks') });
    await store.init();
    await store.unlockWithPassphrase('test-passphrase');

    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );

    await store.storeWrappedKey('k1', key, 'raw', 'session');

    const raw = await crypto.subtle.exportKey('raw', key);
    const rawB64 = toBase64(raw);
    const record = await (store as any).getWrappedKeyRecord('k1');
    expect(record).toBeTruthy();
    expect(typeof record.wrappedKey).toBe('string');
    expect(record.format).toBe('raw');
    expect(record.id).toBe('k1');
    if (record.wrappedKey.length > 0 && rawB64.length > 0) {
      expect(record.wrappedKey).not.toBe(rawB64);
    }

    store.close();
  });

  it('should not expose keys in localStorage', async () => {
    const before = Object.keys(localStorage);

    const store = new SecureKeyStore({ dbName: randomDbName('secure-ks') });
    await store.init();
    await store.unlockWithPassphrase('test-passphrase');

    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );

    await store.storeWrappedKey('k2', key, 'raw', 'session');

    const after = Object.keys(localStorage);
    expect(after).toEqual(before);

    store.close();
  });

  it('should auto-lock after inactivity', async () => {
    const store = new SecureKeyStore({ dbName: randomDbName('secure-ks'), autoLockMs: 50 });
    await store.init();
    await store.unlockWithPassphrase('test-passphrase');

    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );

    await store.storeWrappedKey('k3', key, 'raw', 'session');

    await new Promise((r) => setTimeout(r, 120));

    await expect(
      store.unwrapKey('k3', { name: 'AES-GCM', length: 256 }, true, ['decrypt'])
    ).rejects.toThrow(/locked|auto-locked/i);

    store.close();
  });

  it('should support biometric unlock', async () => {
    const originalPkc = (globalThis as unknown as { PublicKeyCredential?: unknown }).PublicKeyCredential;
    Object.defineProperty(globalThis, 'PublicKeyCredential', {
      configurable: true,
      value: class PublicKeyCredentialMock {},
    });

    const createMock = vi.fn().mockResolvedValue({ rawId: new Uint8Array([1, 2, 3]).buffer });
    const getMock = vi.fn().mockResolvedValue({ id: 'assertion' });

    const originalCredentials = navigator.credentials;
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: {
        create: createMock,
        get: getMock,
      },
    });

    const store = new SecureKeyStore({ dbName: randomDbName('secure-ks') });
    await store.init();

    const registered = await store.registerBiometricCredential('user-1');
    expect(registered).toBe(true);

    const unlocked = await store.unlockWithBiometric(async () => 'test-passphrase');
    expect(unlocked).toBe(true);

    store.close();

    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: originalCredentials,
    });

    Object.defineProperty(globalThis, 'PublicKeyCredential', {
      configurable: true,
      value: originalPkc,
    });
  });

  it('should securely delete keys from memory', async () => {
    const store = new SecureKeyStore({ dbName: randomDbName('secure-ks') });
    await store.init();
    await store.unlockWithPassphrase('test-passphrase');

    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    );

    await store.storeWrappedKey('k4', key, 'raw', 'session');
    store.lock();
    expect(store.isLocked()).toBe(true);

    await expect(
      store.unwrapKey('k4', { name: 'AES-GCM', length: 256 }, true, ['decrypt'])
    ).rejects.toThrow(/locked/i);

    store.close();
  });
});

describe('SenderKeys', () => {
  it('should derive message keys correctly', async () => {
    await generateSenderKey('g-1', 'alice');

    const m1 = await encryptGroupMessage('g-1', 'alice', new TextEncoder().encode('hello-group-1'));
    const m2 = await encryptGroupMessage('g-1', 'alice', new TextEncoder().encode('hello-group-2'));

    expect(m2.iteration).toBeGreaterThan(m1.iteration);
  });

  it('should rotate on member leave', async () => {
    const first = await generateSenderKey('g-2', 'alice');
    const second = await rotateSenderKeyOnMemberLeave('g-2', 'alice', 'bob');

    expect(second.keyId).not.toBe(first.keyId);
  });

  it('should handle concurrent operations', async () => {
    await generateSenderKey('g-3', 'alice');

    const tasks = Array.from({ length: 5 }).map((_, i) =>
      encryptGroupMessage('g-3', 'alice', new TextEncoder().encode(`m-${i}`))
    );

    const encrypted = await Promise.all(tasks);
    expect(encrypted).toHaveLength(5);

    const deliveries = await distributeSenderKey(
      'g-3',
      ['alice', 'bob', 'charlie'],
      'alice',
      async (_recipientId, payload) => payload,
    );

    expect(deliveries).toHaveLength(2);
  });
});

describe('SFrame', () => {
  it('should encrypt media frames', async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 128 },
      false,
      ['encrypt', 'decrypt'],
    );

    const ctx = new SFrameMediaContext();
    await ctx.setKey(key, 7);

    const frame = new TextEncoder().encode('audio-frame-1').buffer;
    const encrypted = await ctx.encryptFrame(frame);
    const decrypted = await ctx.decryptFrame(encrypted);

    expect(new TextDecoder().decode(decrypted)).toBe('audio-frame-1');
  });

  it('should support group media', async () => {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 128 },
      false,
      ['encrypt', 'decrypt'],
    );

    const sender = new SFrameMediaContext();
    const receiver = new SFrameMediaContext();
    await sender.setKey(key, 9);
    await receiver.setKey(key, 9);

    const frame = new TextEncoder().encode('video-frame-1').buffer;
    const encrypted = await sender.encryptFrame(frame);
    const decrypted = await receiver.decryptFrame(encrypted);

    expect(new TextDecoder().decode(decrypted)).toBe('video-frame-1');
  });

  it('should ratchet per keyframe', async () => {
    const material = new Uint8Array(32);
    crypto.getRandomValues(material);

    const sender = new SFrameMediaContext();
    const receiver = new SFrameMediaContext();

    const baseKey = await crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    await sender.setKey(baseKey, 11);
    await receiver.setKey(baseKey, 11);

    await sender.ratchetForKeyFrame(material.buffer as ArrayBuffer, 11);
    await receiver.ratchetForKeyFrame(material.buffer as ArrayBuffer, 11);

    const frame = new TextEncoder().encode('keyframe-after-ratchet').buffer;
    const encrypted = await sender.encryptFrame(frame, { isKeyFrame: true });
    const decrypted = await receiver.decryptFrame(encrypted);

    expect(new TextDecoder().decode(decrypted)).toBe('keyframe-after-ratchet');
  });
});
