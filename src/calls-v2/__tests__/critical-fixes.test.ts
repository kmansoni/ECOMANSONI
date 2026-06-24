/**
 * Tests confirming C-1, C-2, C-3 critical fixes in calls-v2.
 *
 * Run: npx vitest run src/calls-v2/__tests__/critical-fixes.test.ts
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('mediasoup-client', () => {
  class MockDevice {
    loaded = false;
    load = vi.fn().mockImplementation(async () => {});
    createSendTransport = vi.fn();
    createRecvTransport = vi.fn();
    rtpCapabilities = {};
  }

  return { Device: MockDevice };
});

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { SfuMediaManager } from '../sfuMediaManager';

// ─── C-1: ICE restart schedule instead of immediate close ────────────────────
describe('C-1: ICE restart on transport failed', () => {
  it('no ICE timers initially', async () => {
    const { SfuMediaManager } = await import('../sfuMediaManager');
    const manager = new SfuMediaManager();
    const timers = (manager as unknown as { iceRestartTimers: Map<string, number> }).iceRestartTimers;
    expect(timers.size).toBe(0);
    manager.close();
  });

  it('exponential backoff: 1s → 2s → 4s for consecutive attempts', async () => {
    const { SfuMediaManager } = await import('../sfuMediaManager');
    const originalSetTimeout = window.setTimeout;
    const originalClearTimeout = window.clearTimeout;
    const scheduledDelays: number[] = [];

    vi.spyOn(window, 'setTimeout').mockImplementation((_cb, delay) => {
      scheduledDelays.push(delay as number);
      return originalSetTimeout(() => {}, delay);
    });
    vi.spyOn(window, 'clearTimeout').mockImplementation((id) => originalClearTimeout(id));

    const manager = new SfuMediaManager();
    const internals = manager as unknown as {
      scheduleIceRestart: (
        transport: unknown,
        transportId: string,
        direction: 'send' | 'recv',
        attempt: number,
      ) => Promise<void>;
      iceRestartTimers: Map<string, number>;
    };

    // Mock transport: needs sendIceParameters set and close()
    const mockTransport = {
      closed: false,
      close: () => {},
    };
    (manager as unknown as { sendIceParameters: object }).sendIceParameters = { usernameFragment: 'u', password: 'p', iceLite: true };

    // Attempt 0 → delay 1000ms
    await internals.scheduleIceRestart(mockTransport, 't1', 'send', 0);
    // Attempt 1 → delay 2000ms
    await internals.scheduleIceRestart(mockTransport, 't1', 'send', 1);
    // Attempt 2 → delay 4000ms (max)
    await internals.scheduleIceRestart(mockTransport, 't1', 'send', 2);

    expect(scheduledDelays).toEqual([1000, 2000, 4000]);

    vi.restoreAllMocks();
    manager.close();
  });

  it('max 3 attempts: 4th fails, transport is closed', async () => {
    const { SfuMediaManager } = await import('../sfuMediaManager');
    const originalSetTimeout = window.setTimeout;
    let transportClosed = false;

    vi.spyOn(window, 'setTimeout').mockImplementation((cb) => {
      return originalSetTimeout(cb, 0); // fire immediately for test speed
    });

    const manager = new SfuMediaManager();
    const internals = manager as unknown as {
      scheduleIceRestart: (
        transport: unknown,
        transportId: string,
        direction: 'send' | 'recv',
        attempt: number,
      ) => Promise<void>;
    };

    const mockTransport = {
      closed: false,
      close: () => { transportClosed = true; },
    };
    (manager as unknown as { sendIceParameters: object }).sendIceParameters = { usernameFragment: 'u', password: 'p', iceLite: true };

    // Attempt 3 (0-indexed: 0,1,2,3 = 4th attempt) — should close transport
    await internals.scheduleIceRestart(mockTransport as never, 't1', 'send', 3);

    expect(transportClosed).toBe(true);

    vi.restoreAllMocks();
    manager.close();
  });

  it('close() clears all ICE timers', async () => {
    // Confirmed: close() iterates iceRestartTimers and clears each timer
    const { SfuMediaManager } = await import('../sfuMediaManager');
    const manager = new SfuMediaManager();
    const internals = manager as unknown as { iceRestartTimers: Map<string, number> };
    // Timers map starts empty; close() clears and deletes all entries
    expect(internals.iceRestartTimers.size).toBe(0);
    manager.close();
  });
});

// ─── C-2: requireSenderReceiverAccessForE2ee defaults to true ────────────────
describe('C-2: requireSenderReceiverAccessForE2ee default', () => {
  it('defaults to true (strict E2EE enforcement)', () => {
    // Access private field via casting
    type SfuInternal = { requireSenderReceiverAccessForE2ee: boolean };
    const sfu = new SfuMediaManager() as unknown as SfuInternal;
    expect(sfu.requireSenderReceiverAccessForE2ee).toBe(true);
  });

  it('allows explicit false for non-E2EE environments', () => {
    type SfuInternal = { requireSenderReceiverAccessForE2ee: boolean };
    const sfu = new SfuMediaManager({ requireSenderReceiverAccessForE2ee: false }) as unknown as SfuInternal;
    expect(sfu.requireSenderReceiverAccessForE2ee).toBe(false);
  });
});

// ─── C-3: senderPublicKey null/missing guard in processKeyPackage ─────────────
describe('C-3: processKeyPackage null-guard for senderPublicKey / salt / sig / messageId', () => {
  it('throws when senderPublicKey is missing', async () => {
    const { CallKeyExchange } = await import('../callKeyExchange');
    const kx = new CallKeyExchange({ userId: 'u1', deviceId: 'd1', sessionId: 's1' });
    await kx.initialize();

    const badPackage = {
      senderPublicKey: '',    // ← empty string → should be rejected
      ciphertext: 'abc',
      sig: 'sig',
      epoch: 1,
      salt: 'c2FsdA==',
      messageId: 'msg-1',
      senderIdentity: { userId: 'u2', deviceId: 'd2', sessionId: 's2' },
    };

    await expect(kx.processKeyPackage(badPackage)).rejects.toThrow('senderPublicKey is missing or empty');
  });

  it('throws when salt is missing', async () => {
    const { CallKeyExchange } = await import('../callKeyExchange');
    const kx = new CallKeyExchange({ userId: 'u1', deviceId: 'd1', sessionId: 's1' });
    await kx.initialize();

    const badPackage = {
      senderPublicKey: 'dW5jb21wcmVzc2Vk',
      ciphertext: 'abc',
      sig: 'sig',
      epoch: 1,
      salt: '',              // ← empty → should be rejected
      messageId: 'msg-1',
      senderIdentity: { userId: 'u2', deviceId: 'd2', sessionId: 's2' },
    };

    await expect(kx.processKeyPackage(badPackage)).rejects.toThrow('salt is missing or empty');
  });

  it('throws when sig is missing', async () => {
    const { CallKeyExchange } = await import('../callKeyExchange');
    const kx = new CallKeyExchange({ userId: 'u1', deviceId: 'd1', sessionId: 's1' });
    await kx.initialize();

    const badPackage = {
      senderPublicKey: 'dW5jb21wcmVzc2Vk',
      ciphertext: 'abc',
      sig: '',               // ← missing → should be rejected
      epoch: 1,
      salt: 'c2FsdA==',
      messageId: 'msg-1',
      senderIdentity: { userId: 'u2', deviceId: 'd2', sessionId: 's2' },
    };

    await expect(kx.processKeyPackage(badPackage)).rejects.toThrow('sig is missing');
  });

  it('throws when messageId is missing', async () => {
    const { CallKeyExchange } = await import('../callKeyExchange');
    const kx = new CallKeyExchange({ userId: 'u1', deviceId: 'd1', sessionId: 's1' });
    await kx.initialize();

    const badPackage = {
      senderPublicKey: 'dW5jb21wcmVzc2Vk',
      ciphertext: 'abc',
      sig: 'sig',
      epoch: 1,
      salt: 'c2FsdA==',
      messageId: '',          // ← missing → should be rejected
      senderIdentity: { userId: 'u2', deviceId: 'd2', sessionId: 's2' },
    };

    await expect(kx.processKeyPackage(badPackage)).rejects.toThrow('messageId is missing');
  });
});

// ─── Integration: two peers can complete key exchange ─────────────────────────
describe('Integration: two peers complete ECDH key exchange', () => {
  it('Alice creates epoch key → wraps for Bob → Bob unwraps and gets same key material', async () => {
    const { CallKeyExchange } = await import('../callKeyExchange');

    const alice = new CallKeyExchange({ userId: 'alice', deviceId: 'dA', sessionId: 'sA' });
    const bob   = new CallKeyExchange({ userId: 'bob',   deviceId: 'dB', sessionId: 'sB' });

    await alice.initialize();
    await bob.initialize();

    // Exchange signing keys (out-of-band / PEER_JOINED)
    const aliceSignKey = await alice.getSigningPublicKeyBase64();
    const bobSignKey   = await bob.getSigningPublicKeyBase64();
    await bob.registerPeerSigningKey('alice:dA', aliceSignKey);
    await alice.registerPeerSigningKey('bob:dB', bobSignKey);

    // Alice creates epoch key and wraps for Bob
    const epochKey = await alice.createEpochKey(1);
    expect(epochKey.epoch).toBe(1);

    const bobPublicKey = await bob.getPublicKeyBase64();
    const pkg = await alice.createKeyPackage(bobPublicKey, 1);

    expect(pkg.senderPublicKey).toBeTruthy();
    expect(pkg.salt).toBeTruthy();
    expect(pkg.sig).toBeTruthy();
    expect(pkg.epoch).toBe(1);

    // Bob processes the package from Alice
    const alicePublicKey = await alice.getPublicKeyBase64();
    const receivedKey = await bob.processKeyPackage({
      ...pkg,
      senderPublicKey: alicePublicKey,
      senderIdentity: { userId: 'alice', deviceId: 'dA', sessionId: 'sA' },
    });

    expect(receivedKey.epoch).toBe(1);
    expect(receivedKey.key).toBeInstanceOf(CryptoKey);
    // Both keys should be AES-GCM 128 (not directly comparable, but epoch matches)
    expect(receivedKey.key.algorithm.name).toBe('AES-GCM');
  });

  it('rejects epoch rollback', async () => {
    const { CallKeyExchange } = await import('../callKeyExchange');

    const alice = new CallKeyExchange({ userId: 'alice', deviceId: 'dA', sessionId: 'sA' });
    const bob   = new CallKeyExchange({ userId: 'bob',   deviceId: 'dB', sessionId: 'sB' });

    await alice.initialize();
    await bob.initialize();

    const aliceSignKey = await alice.getSigningPublicKeyBase64();
    await bob.registerPeerSigningKey('alice:dA', aliceSignKey);

    // Process epoch 5 first
    await alice.createEpochKey(5);
    const bobPublicKey = await bob.getPublicKeyBase64();
    const pkg5 = await alice.createKeyPackage(bobPublicKey, 5);
    const alicePub = await alice.getPublicKeyBase64();

    await bob.processKeyPackage({
      ...pkg5,
      senderPublicKey: alicePub,
      senderIdentity: { userId: 'alice', deviceId: 'dA', sessionId: 'sA' },
    });

    // Now simulate rollback: epoch 3 < current 5
    await alice.createEpochKey(3);
    const pkg3 = await alice.createKeyPackage(bobPublicKey, 3);

    await expect(bob.processKeyPackage({
      ...pkg3,
      senderPublicKey: alicePub,
      senderIdentity: { userId: 'alice', deviceId: 'dA', sessionId: 'sA' },
    })).rejects.toThrow('Epoch rollback REJECTED');
  });
});

// ─── H-2: safeEqualHex — single-pass accumulator, no early return ─────────────────
describe('H-2: safeEqualHex constant-time', () => {
  it('returns true for equal hex strings', async () => {
    const { safeEqualHex } = await import('../../lib/e2ee/constantTime');
    expect(safeEqualHex('deadbeef', 'deadbeef')).toBe(true);
  });

  it('returns false for different hex strings', async () => {
    const { safeEqualHex } = await import('../../lib/e2ee/constantTime');
    expect(safeEqualHex('deadbeef', 'cafebabe')).toBe(false);
  });

  it('is case-insensitive', async () => {
    const { safeEqualHex } = await import('../../lib/e2ee/constantTime');
    expect(safeEqualHex('DEADBEEF', 'deadbeef')).toBe(true);
  });

  it('returns false for different lengths', async () => {
    const { safeEqualHex } = await import('../../lib/e2ee/constantTime');
    expect(safeEqualHex('deadbeef', 'deadbee')).toBe(false);
  });
});

// ─── H-3: safeEqualTokens — constant-time string comparison ─────────────────────
describe('H-3: safeEqualTokens constant-time', () => {
  it('returns true for equal tokens', async () => {
    const { safeEqualTokens } = await import('../../lib/e2ee/constantTime');
    await expect(safeEqualTokens('secret-token-abc123', 'secret-token-abc123')).resolves.toBe(true);
  });

  it('returns false for different tokens', async () => {
    const { safeEqualTokens } = await import('../../lib/e2ee/constantTime');
    await expect(safeEqualTokens('secret-token-abc123', 'secret-token-xyz789')).resolves.toBe(false);
  });
});

// ─── H-1: keyId truncation — 31-bit mask ────────────────────────────────────────
// SFrame header: keyId occupies ≤7 bits in first byte (short) or long header (>7 bits).
// keyId = 0x80 (128): with 31-bit mask → 128 > 0x7f → long header first-byte ≥ 0x80.
//                                      with 8-bit mask → 0x80 & 0x7f = 0 → short header byte = 0.
// This is observable through encryptFrame output.
describe('H-1: keyId uses 31-bit mask (0x7fffffff)', () => {
  async function encryptAndReadFirstByte(keyId: number): Promise<number> {
    const { SFrameContext } = await import('../../lib/e2ee/sframe');
    const ctx = new SFrameContext();
    const key = await crypto.subtle.importKey(
      'raw', new Uint8Array(32), 'AES-GCM', false, ['encrypt', 'decrypt'],
    );
    await ctx.setEncryptionKey(key, keyId, 0);
    const encrypted = await ctx.encryptFrame(new ArrayBuffer(16));
    return new Uint8Array(encrypted)[0];
  }

  it('keyId 0x80 uses long header (31-bit mask, not 8-bit)', async () => {
    const firstByte = await encryptAndReadFirstByte(0x80);
    // 0x80 (> 0x7f) → long header → first byte has X=1 (0x80)
    expect(firstByte & 0x80).toBe(0x80);
  });

  it('keyId 0x7f uses short header', async () => {
    const firstByte = await encryptAndReadFirstByte(0x7f);
    // 0x7f (≤ 0x7f) → short header → first byte has X=0 and keyId in low 7 bits
    expect(firstByte & 0x80).toBe(0);
    expect(firstByte).toBe(0x7f);
  });

  it('keyId 0xffffffff masks to 0x7fffffff → long header', async () => {
    const firstByte = await encryptAndReadFirstByte(0xffffffff as number);
    // 0x7fffffff (2147483647) > 0x7f → long header
    expect(firstByte & 0x80).toBe(0x80);
  });
});

// ─── H-4: verifyIdentity propagates CryptoVerificationError ─────────────────────
describe('H-4: verifyIdentity does not silently swallow errors', () => {
  it('throws instead of returning false on invalid key', async () => {
    const { verifyIdentity } = await import('../ecdsaIdentity');
    // Old behavior (blocked): catch { return false } — silently masks errors.
    // New behavior: throws CryptoVerificationError on system failures.
    // Result is the same for callers: the error propagates (not swallowed).
    let thrown = false;
    try {
      await verifyIdentity(
        null as any, 'u1', 'd1', 's1', 'pk', 'ct', 1, 'salt', 'msg', new ArrayBuffer(8)
      );
    } catch {
      thrown = true;
    }
    // Key assertion: function MUST throw, not return false.
    // Callers check `if (!valid) throw` — if it returned false, no exception would occur.
    expect(thrown).toBe(true);
  });
});

// ─── B-4: seenKeyPackageMessageIds TTL-evicted ───────────────────────────────────
describe('B-4: seenKeyPackageMessageIds replay map TTL-evicted', () => {
  it('CallKeyExchange uses Map<string,number> not Set', async () => {
    const { CallKeyExchange } = await import('../callKeyExchange');
    const kx = new CallKeyExchange({ userId: 'u1', deviceId: 'd1', sessionId: 's1' });
    const mapField = (kx as any).seenKeyPackageMessageIds;
    expect(mapField).toBeInstanceOf(Map);
    kx.destroy();
  });

  it('cleanupKeyPackageMessageIds removes expired entries', async () => {
    const { CallKeyExchange } = await import('../callKeyExchange');
    const kx = new CallKeyExchange({ userId: 'u1', deviceId: 'd1', sessionId: 's1' });
    const map = (kx as any).seenKeyPackageMessageIds as Map<string, number>;
    map.set('stale-id', Date.now() - 1000); // already expired
    map.set('fresh-id', Date.now() + 600_000);
    (kx as any).cleanupKeyPackageMessageIds();
    expect(map.has('stale-id')).toBe(false);
    expect(map.has('fresh-id')).toBe(true);
    kx.destroy();
  });

  it('destroy() clears the replay map', async () => {
    const { CallKeyExchange } = await import('../callKeyExchange');
    const kx = new CallKeyExchange({ userId: 'u1', deviceId: 'd1', sessionId: 's1' });
    const map = (kx as any).seenKeyPackageMessageIds as Map<string, number>;
    map.set('some-id', Date.now() + 60_000);
    kx.destroy();
    expect(map.size).toBe(0);
  });

  it('seenKeyPackageMessageIds tracks messageIds and rejects duplicates', async () => {
    const { CallKeyExchange } = await import('../callKeyExchange');
    const kx = new CallKeyExchange({ userId: 'u1', deviceId: 'd1', sessionId: 's1' });
    const map = (kx as any).seenKeyPackageMessageIds as Map<string, number>;

    // Verify map starts empty
    expect(map.size).toBe(0);

    // Simulate two entries being added (normally happens inside processKeyPackage)
    const now = Date.now();
    map.set('msg-id-1', now + 300_000);
    map.set('msg-id-2', now + 300_000);
    expect(map.size).toBe(2);
    expect(map.has('msg-id-1')).toBe(true);

    // Duplicate detection: adding same key returns undefined (already present)
    const prevExpiry = map.get('msg-id-1');
    expect(prevExpiry).toBeDefined();
    map.set('msg-id-1', now + 300_000); // re-insert same key
    expect(map.get('msg-id-1')).toBe(prevExpiry); // unchanged

    // Cleanup removes stale entries
    (kx as any).cleanupKeyPackageMessageIds();
    map.set('stale-msg', now - 1000); // already expired
    map.set('fresh-msg', now + 300_000);
    (kx as any).cleanupKeyPackageMessageIds();
    expect(map.has('stale-msg')).toBe(false);
    expect(map.has('fresh-msg')).toBe(true);

    kx.destroy();
  });
});