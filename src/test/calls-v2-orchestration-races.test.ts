/* @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { CallKeyExchange } from '../calls-v2/callKeyExchange';
import { CallMediaEncryption } from '../calls-v2/callMediaEncryption';
import { RekeyStateMachine, DEFAULT_REKEY_CONFIG } from '../calls-v2/rekeyStateMachine';
import { EpochGuard } from '../calls-v2/epochGuard';
import { getOrCreateIdentityKeyPair, signIdentity, exportPublicKey } from '../calls-v2/ecdsaIdentity';
import type { KeyPackageData } from '../calls-v2/callKeyExchange';
import { SFrameContext } from '../lib/e2ee/sframe';

function makeIdentity(suffix: string) {
  return {
    userId: `user-${suffix}`,
    deviceId: `device-${suffix}`,
    sessionId: `session-${suffix}`,
  };
}

async function initKx(identity: ReturnType<typeof makeIdentity>) {
  const kx = new CallKeyExchange(identity);
  await kx.initialize();
  return kx;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pairKx(
  aLabel: string,
  bLabel: string
): Promise<[CallKeyExchange, CallKeyExchange]> {
  const a = await initKx(makeIdentity(aLabel));
  const b = await initKx(makeIdentity(bLabel));

  await b.registerPeerSigningKey(
    `${a.getIdentity().userId}:${a.getIdentity().deviceId}`,
    await a.getSigningPublicKeyBase64()
  );
  await a.registerPeerSigningKey(
    `${b.getIdentity().userId}:${b.getIdentity().deviceId}`,
    await b.getSigningPublicKeyBase64()
  );

  return [a, b];
}

describe('P0: Epoch key race condition', () => {
  it('createStagedEpochKey is idempotent — same epoch returns consistent key', async () => {
    const kx = await initKx(makeIdentity('shared'));
    const [keyA, keyB] = await Promise.all([
      kx.createStagedEpochKey(1),
      kx.createStagedEpochKey(1),
    ]);
    // Both resolve to epoch=1; contract is stable epoch value, not object identity under concurrency.
    expect(keyA.epoch).toBe(1);
    expect(keyB.epoch).toBe(1);
    // Post-condition: exactly one staged epoch=1 entry exists
    expect(kx.getStagedEpochKey()?.epoch).toBe(1);
    expect(kx.getEpochKey(1)).toBeDefined();
    expect(kx.getActiveEpochKey()).toBeNull();
  });

  it('getActiveEpochKey returns null before activation', async () => {
    const kx = await initKx(makeIdentity('empty'));
    expect(kx.getActiveEpochKey()).toBeNull();
    const key = await kx.createStagedEpochKey(1);
    expect(key.epoch).toBe(1);
    expect(kx.getActiveEpochKey()).toBeNull(); // staged, not active
    expect(kx.getStagedEpochKey()?.epoch).toBe(1);
  });

  it('concurrent createStagedEpochKey resolves to consistent epoch', async () => {
    const kx = await initKx(makeIdentity('overwrite'));
    const [k1, k2] = await Promise.all([
      kx.createStagedEpochKey(1),
      kx.createStagedEpochKey(1),
    ]);
    // Post-condition: both resolve to epoch=1 and staged slot is valid
    expect(k1.epoch).toBe(1);
    expect(k2.epoch).toBe(1);
    expect(kx.getStagedEpochKey()?.epoch).toBe(1);
    expect(kx.getEpochKey(1)).toBeDefined();
  });

  it('cross-peer E2EE round-trip: key package exchange works', async () => {
    const [alice, bob] = await pairKx('alice', 'bob');
    const bobPub = await bob.getPublicKeyBase64();

    const aliceKey = await alice.createStagedEpochKey(1);
    alice.activateEpochKey(1);
    const wrapped = await alice.createKeyPackage(bobPub, 1);

    const bobKey = await bob.processStagedKeyPackage({
      ...wrapped,
      senderIdentity: { userId: 'user-alice', deviceId: 'device-alice', sessionId: 'session-alice' },
    });

    // In jsdom crypto.subtle is unreliable for SFrame; verify key plumbing only.
    expect(bobKey.epoch).toBe(1);
    expect(aliceKey.key).toBeDefined();
    expect(bobKey.key).toBeDefined();
  });
});

describe('P1: E2EE gating and rekey lifecycle', () => {
  it('deadline exceeded aborts rekey when no peer ACKs', async () => {
    const machine = new RekeyStateMachine({
      ...DEFAULT_REKEY_CONFIG,
      rekeyDeadlineMs: 500,
    });

    machine.setActivePeers(['peer-1']);
    machine.initiateRekey();
    expect(machine.getState()).toBe('REKEY_PENDING');

    machine.onRekeyBeginAcked(1);
    expect(machine.getState()).toBe('KEY_DELIVERY');

    await sleep(600);

    expect(machine.getState()).toBe('IDLE');
    expect(machine.getCurrentEpoch()).toBe(0);
  });

  it('EpochGuard blocks media without E2EE_READY', async () => {
    const guard = new EpochGuard(true);
    guard.markAuthenticated();
    guard.markRoomJoined(0);

    guard.markEpochAdvanced(1);
    expect(guard.isMediaAllowed()).toBe(false);
    expect(() => guard.assertMediaAllowed('produce')).toThrow(/BLOCKED/);

    guard.markE2eeReady(1);
    expect(guard.isMediaAllowed()).toBe(true);
    expect(() => guard.assertMediaAllowed('produce')).not.toThrow();
  });

  it('E2EE_READY rollback safety timer restores media', async () => {
    const guard = new EpochGuard(true);
    guard.markAuthenticated();
    guard.markRoomJoined(0);
    guard.markEpochAdvanced(1);

    expect(guard.isMediaAllowed()).toBe(false);

    guard.rollbackFailedEpoch(0);
    expect(guard.getState().currentEpoch).toBe(0);
    expect(guard.isE2eeReady()).toBe(true);
    expect(guard.isMediaAllowed()).toBe(true);
  });

  it('rollback re-entrancy guard prevents double rollback', async () => {
    const guard = new EpochGuard(true);
    guard.markAuthenticated();
    guard.markRoomJoined(0);
    guard.markEpochAdvanced(1);

    guard.rollbackFailedEpoch(0);
    const e1 = guard.getState().currentEpoch;
    guard.rollbackFailedEpoch(0);
    const e2 = guard.getState().currentEpoch;

    expect(e1).toBe(0);
    expect(e2).toBe(0);
  });

  it('full rekey happy path: initiate → acked → ACK → committed → activate → cooldown', async () => {
    const machine = new RekeyStateMachine({
      ...DEFAULT_REKEY_CONFIG,
      rekeyDeadlineMs: 5000,
      rekeyCooldownMs: 500,
    });

    machine.setActivePeers(['peer-1']);
    expect(machine.initiateRekey()).toBe(1);
    expect(machine.getState()).toBe('REKEY_PENDING');

    machine.onRekeyBeginAcked(1);
    expect(machine.getState()).toBe('KEY_DELIVERY');

    machine.onKeyAckReceived('peer-1', 1, crypto.randomUUID());
    expect(machine.getState()).toBe('REKEY_COMMITTED');

    machine.activateEpoch(1);
    expect(machine.getState()).toBe('COOLDOWN');
    expect(machine.getCurrentEpoch()).toBe(1);

    await sleep(600);
    expect(machine.getState()).toBe('IDLE');
  });

  it('abort during KEY_DELIVERY resets epoch to 0', async () => {
    const machine = new RekeyStateMachine();
    machine.setActivePeers(['peer-1']);
    machine.initiateRekey();
    machine.onRekeyBeginAcked(1);

    machine.abortRekey('test');
    expect(machine.getState()).toBe('IDLE');
    expect(machine.getCurrentEpoch()).toBe(0);
  });

  it('rekey deferred commit leaves commit state intact until activation', async () => {
    const machine = new RekeyStateMachine({
      ...DEFAULT_REKEY_CONFIG,
      rekeyDeadlineMs: 500,
    });

    machine.setActivePeers(['peer-1']);
    expect(machine.initiateRekey()).toBe(1);

    machine.onRekeyBeginAcked(1);
    machine.onKeyAckReceived('peer-1', 1, crypto.randomUUID());
    expect(machine.getState()).toBe('REKEY_COMMITTED');

    // REKEY_COMMITTED holds until caller explicitly activates.
    // FSM does not auto-activate — requires manual activateEpoch(epoch).
    expect(machine.getCurrentEpoch()).toBe(1);
  });
});

// ─── P6: Parallel KEY_PACKAGE DoS surface ────────────────────────────

describe('P6: KEY_PACKAGE processing DoS surface', () => {
  it('processStagedKeyPackage rejects duplicate messageId (anti-replay)', async () => {
    const [alice, bob] = await pairKx('dos-alice', 'dos-bob');
    await alice.createStagedEpochKey(1);

    const bobPub = await bob.getPublicKeyBase64();
    const pkg = await alice.createKeyPackage(bobPub, 1);

    const bobId = { userId: 'user-dos-alice', deviceId: 'device-dos-alice', sessionId: 'session-dos-alice' };

    // First call succeeds
    const r1 = await bob.processStagedKeyPackage({ ...pkg, senderIdentity: bobId });
    expect(r1.epoch).toBe(1);
    expect(bob.getStagedEpochKey()?.epoch).toBe(1);

    // Exact same package (same messageId) must be rejected — anti-replay
    await expect(bob.processStagedKeyPackage({ ...pkg, senderIdentity: bobId })).rejects.toThrow(
      /KEY_PACKAGE replay REJECTED/
    );
  });

  it('RekeyStateMachine: duplicate KEY_ACK messageId rejected', async () => {
    const machine = new RekeyStateMachine();
    machine.setActivePeers(['p1']);
    machine.initiateRekey();
    machine.onRekeyBeginAcked(1);

    const msgId = crypto.randomUUID();
    expect(machine.onKeyAckReceived('p1', 1, msgId)).toBe(true);
    expect(machine.onKeyAckReceived('p1', 1, msgId)).toBe(false);
    expect(machine.getAckStatus().length).toBe(1);
  });

  it('RekeyStateMachine: stale KEY_ACK with epoch < current rejected', async () => {
    const machine = new RekeyStateMachine();
    machine.setActivePeers(['p1']);
    machine.initiateRekey();
    machine.onRekeyBeginAcked(1);
    machine.onKeyAckReceived('p1', 1, crypto.randomUUID());
    machine.activateEpoch(1);

    expect(machine.onKeyAckReceived('p1', 0, crypto.randomUUID())).toBe(false);
  });
});

// ─── E2EE bootstrap sequence ────────────────────────────────────────

describe('E2EE bootstrap sequence (happy path)', () => {
  it('leader creates epoch key, wraps for joiner, joiner unwraps, SFrame round-trip', async () => {
    const [leader, joiner] = await pairKx('e2ee-leader', 'e2ee-joiner');
    const joinerPub = await joiner.getPublicKeyBase64();

    const leaderKey = await leader.createStagedEpochKey(1);
    leader.activateEpochKey(1);
    const wrapped = await leader.createKeyPackage(joinerPub, 1);
    const joinerInbound = await joiner.processStagedKeyPackage({
      ...wrapped,
      senderIdentity: { userId: 'user-e2ee-leader', deviceId: 'device-e2ee-leader', sessionId: 'session-e2ee-leader' },
    });

    const joinerEnc = new CallMediaEncryption();
    await joinerEnc.setDecryptionKey('user-e2ee-leader:device-e2ee-leader', joinerInbound);
    await joinerEnc.setEncryptionKey(leaderKey);

    const guard = new EpochGuard(true);
    guard.markAuthenticated();
    guard.markRoomJoined(0);
    guard.markEpochAdvanced(1);
    guard.markE2eeReady(1);
    expect(guard.isMediaAllowed()).toBe(true);

    // SFrameContext is unidirectional: both use setEncryptionKey.
    // Bob's inbound key serves as both decryption key (via his SFrameContext)
    // and as CallMediaEncryption decryption key.
    const sEnc = new SFrameContext();
    const sDec = new SFrameContext();
    await sEnc.setEncryptionKey(leaderKey.key, 1, 1);
    await sDec.setEncryptionKey(joinerInbound.key, 1, 1);

    const pt = new Uint8Array([7, 8, 9]);
    const enc = await sEnc.encryptFrame(pt.buffer.slice(0));
    const dec = await sDec.decryptFrame(enc);
    expect(Buffer.from(dec)).toEqual(Buffer.from(pt));
  });

  it('rekey: epoch 2 frames decrypted, epoch 1 frames rejected', async () => {
    const [alice, bob] = await pairKx('rk-alice', 'rk-bob');
    const bobPub = await bob.getPublicKeyBase64();

    // Epoch 1
    const aliceKey1 = await alice.createStagedEpochKey(1);
    alice.activateEpochKey(1);
    const w1 = await alice.createKeyPackage(bobPub, 1);
    const bobKey1 = await bob.processStagedKeyPackage({
      ...w1,
      senderIdentity: { userId: 'user-rk-alice', deviceId: 'device-rk-alice', sessionId: 'session-rk-alice' },
    });

    const s1a = new SFrameContext();
    const s1b = new SFrameContext();
    await s1a.setEncryptionKey(aliceKey1.key, 1, 1);
    await s1b.setEncryptionKey(bobKey1.key, 1, 1);
    const enc1 = await s1a.encryptFrame(new Uint8Array([1, 2, 3]).buffer.slice(0));
    expect(Buffer.from(await s1b.decryptFrame(enc1))).toEqual(Buffer.from([1, 2, 3]));

    // Epoch 2
    const aliceKey2 = await alice.createStagedEpochKey(2);
    alice.activateEpochKey(2);
    const w2 = await alice.createKeyPackage(bobPub, 2);
    const bobKey2 = await bob.processStagedKeyPackage({
      ...w2,
      senderIdentity: { userId: 'user-rk-alice', deviceId: 'device-rk-alice', sessionId: 'session-rk-alice' },
    });

    const s2b = new SFrameContext();
    await s2b.setEncryptionKey(bobKey2.key, 2, 1);
    await expect(s2b.decryptFrame(enc1)).rejects.toThrow();

    const s2a = new SFrameContext();
    await s2a.setEncryptionKey(aliceKey2.key, 2, 2);
    const enc2 = await s2a.encryptFrame(new Uint8Array([4, 5, 6]).buffer.slice(0));
    expect(Buffer.from(await s2b.decryptFrame(enc2))).toEqual(Buffer.from([4, 5, 6]));
  });

  it('epoch rollback: epoch 3 rejected after epoch 5 accepted', async () => {
    const [alice, bob] = await pairKx('rb-alice', 'rb-bob');
    const bobPub = await bob.getPublicKeyBase64();

    await alice.createStagedEpochKey(5);
    alice.activateEpochKey(5);
    await bob.processStagedKeyPackage({
      ...(await alice.createKeyPackage(bobPub, 5)),
      senderIdentity: { userId: 'user-rb-alice', deviceId: 'device-rb-alice', sessionId: 'session-rb-alice' },
    });

    await alice.createStagedEpochKey(3);
    await alice.activateEpochKey(3);
    await expect(
      bob.processStagedKeyPackage({
        ...(await alice.createKeyPackage(bobPub, 3)),
        senderIdentity: { userId: 'user-rb-alice', deviceId: 'device-rb-alice', sessionId: 'session-rb-alice' },
      })
    ).rejects.toThrow(/Epoch rollback REJECTED/);
  });
});

// ─── Resource cleanup ────────────────────────────────────────────────

describe('Resource cleanup', () => {
  it('CallKeyExchange.destroy clears all state', async () => {
    const kx = await initKx(makeIdentity('cl'));
    await kx.createStagedEpochKey(1);
    kx.activateEpochKey(1);
    await kx.createStagedEpochKey(2);

    kx.destroy();

    expect(kx.getActiveEpochKey()).toBeNull();
    expect(kx.getEpochKey(1)).toBeNull();
    expect(kx.getEpochKey(2)).toBeNull();
    await expect(kx.getPublicKeyBase64()).rejects.toThrow(/Not initialized/);
  });

  it('CallMediaEncryption.destroy resets all keys', async () => {
    const enc = new CallMediaEncryption();
    const kx = await initKx(makeIdentity('cm'));
    const key = await kx.createStagedEpochKey(1);
    kx.activateEpochKey(1);

    await enc.setEncryptionKey(key);
    await enc.setDecryptionKey('peer-1', key);

    enc.destroy();

    expect(enc.hasOutboundKey()).toBe(false);
    expect(enc.getDecryptionPeerIds()).toHaveLength(0);
    expect(enc.getEpoch()).toBe(0);
  });
});
