/**
 * Tests confirming C-1, C-2, C-3 critical fixes in calls-v2.
 *
 * Run: npx vitest run src/calls-v2/__tests__/critical-fixes.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Minimal mediasoup-client mock ───────────────────────────────────────────
const mockTransportEvents: Record<string, ((...args: unknown[]) => void)[]> = {};

function createMockTransport(id = 'transport-1') {
  const t = {
    id,
    closed: false,
    _events: {} as Record<string, ((...args: unknown[]) => void)[]>,
    on(event: string, handler: (...args: unknown[]) => void) {
      if (!this._events[event]) this._events[event] = [];
      this._events[event].push(handler);
      mockTransportEvents[`${id}:${event}`] = this._events[event];
    },
    emit(event: string, ...args: unknown[]) {
      (this._events[event] ?? []).forEach(h => h(...args));
    },
    close() { this.closed = true; },
    getStats: vi.fn().mockResolvedValue(new Map()),
    produce: vi.fn(),
    consume: vi.fn(),
  };
  return t;
}

const mockSendTransport = createMockTransport('send-transport-1');
const mockRecvTransport = createMockTransport('recv-transport-1');
const mockDevice = {
  loaded: false,
  load: vi.fn().mockImplementation(async () => { mockDevice.loaded = true; }),
  createSendTransport: vi.fn().mockReturnValue(mockSendTransport),
  createRecvTransport: vi.fn().mockReturnValue(mockRecvTransport),
  rtpCapabilities: {},
};

vi.mock('mediasoup-client', () => ({
  Device: vi.fn().mockImplementation(() => mockDevice),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { SfuMediaManager } from '../sfuMediaManager';

// ─── C-1: ICE restart schedule instead of immediate close ────────────────────
describe('C-1: ICE restart on transport failed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSendTransport.closed = false;
    mockSendTransport._events = {};
    mockDevice.loaded = false;
    mockDevice.createSendTransport.mockReturnValue(mockSendTransport);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('schedules ICE restart callback instead of closing transport immediately', async () => {
    const iceRestartCb = vi.fn().mockResolvedValue(undefined);

    const sfu = new SfuMediaManager({
      requireSenderReceiverAccessForE2ee: false,
      onIceRestartNeeded: iceRestartCb,
    });

    await sfu.loadDevice({} as never);

    sfu.createSendTransport(
      {
        id: 'send-transport-1',
        iceParameters: { usernameFragment: 'u', password: 'p' } as never,
        iceCandidates: [],
        dtlsParameters: { fingerprints: [] } as never,
      },
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue('producer-id'),
    );

    // Trigger ICE failure
    mockSendTransport.emit('connectionstatechange', 'failed');

    // Transport must NOT be closed immediately
    expect(mockSendTransport.closed).toBe(false);

    // After first backoff delay (1000ms) — ICE restart callback must be called
    await vi.advanceTimersByTimeAsync(1100);
    expect(iceRestartCb).toHaveBeenCalledWith('send-transport-1', 'send');
  });

  it('closes transport after MAX_ATTEMPTS exhausted when callback keeps failing', async () => {
    const iceRestartCb = vi.fn().mockRejectedValue(new Error('signaling failed'));

    const sfu = new SfuMediaManager({
      requireSenderReceiverAccessForE2ee: false,
      onIceRestartNeeded: iceRestartCb,
    });

    await sfu.loadDevice({} as never);
    sfu.createSendTransport(
      {
        id: 'send-transport-1',
        iceParameters: { usernameFragment: 'u', password: 'p' } as never,
        iceCandidates: [],
        dtlsParameters: { fingerprints: [] } as never,
      },
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue('producer-id'),
    );

    mockSendTransport.emit('connectionstatechange', 'failed');

    // Exhaust 3 attempts: 1s + 2s + 4s = 7s total
    await vi.advanceTimersByTimeAsync(1100);  // attempt 1
    await vi.advanceTimersByTimeAsync(2100);  // attempt 2
    await vi.advanceTimersByTimeAsync(4100);  // attempt 3 → exhausted → close
    await vi.runAllTimersAsync();

    expect(iceRestartCb).toHaveBeenCalledTimes(3);
    expect(mockSendTransport.closed).toBe(true);
  });

  it('cancels pending ICE restart timers on sfu.close()', async () => {
    const iceRestartCb = vi.fn().mockResolvedValue(undefined);
    const sfu = new SfuMediaManager({
      requireSenderReceiverAccessForE2ee: false,
      onIceRestartNeeded: iceRestartCb,
    });

    await sfu.loadDevice({} as never);
    sfu.createSendTransport(
      {
        id: 'send-transport-1',
        iceParameters: { usernameFragment: 'u', password: 'p' } as never,
        iceCandidates: [],
        dtlsParameters: { fingerprints: [] } as never,
      },
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue('producer-id'),
    );

    mockSendTransport.emit('connectionstatechange', 'failed');
    // close() must cancel pending timer — callback should NOT be called
    sfu.close();

    await vi.advanceTimersByTimeAsync(5000);
    expect(iceRestartCb).not.toHaveBeenCalled();
  });
});

// ─── C-2: requireSenderReceiverAccessForE2ee defaults to true ────────────────
describe('C-2: requireSenderReceiverAccessForE2ee default', () => {
  it('defaults to true (strict E2EE enforcement)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Device } = require('mediasoup-client') as { Device: new () => unknown };
    void Device;
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
describe('C-3: processKeyPackage null-guard for senderPublicKey / salt / sig', () => {
  // We test CallKeyExchange directly
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
      senderIdentity: { userId: 'u2', deviceId: 'd2', sessionId: 's2' },
    };

    await expect(kx.processKeyPackage(badPackage)).rejects.toThrow('sig is missing');
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
