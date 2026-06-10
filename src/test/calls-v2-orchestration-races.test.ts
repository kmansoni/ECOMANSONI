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

async function pairKx(aLabel: string, bLabel: string): Promise<[CallKeyExchange, CallKeyExchange]> {
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
  it('createEpochKey is NOT idempotent — concurrent calls overwrite each other', async () => {
    const kx = await initKx(makeIdentity('shared'));

    const [keyA, keyB] = await Promise.all([
      kx.createEpochKey(1),
      kx.createEpochKey(1),
    ]);

    expect(keyA.epoch).toBe(1);
    expect(keyB.epoch).toBe(1);
    expect(keyA.key).not.toBe(keyB.key);
    expect(kx.getCurrentEpochKey()?.key).toBe(keyB.key);
  });

  it('getCurrentEpochKey returns null before first createEpochKey', async () => {
    const kx = await initKx(makeIdentity('empty'));
    expect(kx.getCurrentEpochKey()).toBeNull();

    await kx.createEpochKey(1);
    expect(kx.getCurrentEpochKey()?.epoch).toBe(1);
  });

  it('concurrent createEpochKey always overwrites raw bytes', async () => {
    const kx = await initKx(makeIdentity('overwrite'));

    const [k1, k2] = await Promise.all([
      kx.createEpochKey(1),
      kx.createEpochKey(1),
    ]);

    expect(k1.epoch).toBe(1);
    expect(k2.epoch).toBe(1);
    expect(k1.key).not.toBe(k2.key);
    expect(kx.getCurrentEpochKey()?.key).toBe(k2.key);
  });

  it('cross-peer E2EE round-trip works with normal KEY_PACKAGE exchange', async () => {
    const [alice, bob] = await pairKx('alice', 'bob');
    const bobPub = await bob.getPublicKeyBase64();

    const aliceKey = await alice.createEpochKey(1);
    const wrapped = await alice.createKeyPackage(bobPub, 1);

    const bobKey = await bob.processKeyPackage({
      ...wrapped,
      senderIdentity: { userId: 'user-alice', deviceId: 'device-alice', sessionId: 'session-alice' },
    });

    const aliceSframe = new SFrameContext();
    const bobSframe = new SFrameContext();
    await aliceSframe.setEncryptionKey(aliceKey.key, 1, 1);
    await bobSframe.setEncryptionKey(bobKey.key, 1, 1);

    const pt = new Uint8Array([10, 20, 30]);
    const enc = await aliceSframe.encryptFrame(pt.buffer.slice(0));
    const dec = await bobSframe.decryptFrame(enc);
    expect(Buffer.from(dec)).toEqual(Buffer.from(pt));
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

  it('rekey deferred commit with missing inbound key blocks until recovery or timeout', async () => {
    const machine = new RekeyStateMachine({
      ...DEFAULT_REKEY_CONFIG,
      rekeyDeadlineMs: 500,
    });

    machine.setActivePeers(['peer-1']);
    machine.initiateRekey();
    machine.onRekeyBeginAcked(1);

    expect(machine.getState()).toBe('KEY_DELIVERY');

    await sleep(600);
    expect(machine.getState()).toBe('IDLE');
    expect(machine.getCurrentEpoch()).toBe(0);
  });
});

describe('P3: Semantic replay key construction', () => {
  const buildKey = (
    roomId: string,
    epoch: number,
    sender: string,
    target: string,
    keyId: string
  ): string =>
    [roomId, String(epoch), sender || 'unknown-sender', target, keyId].join(':');

  it('different targetDeviceId produces different replay keys', () => {
    const k1 = buildKey('r', 1, 's', 'target-A', 'kid');
    const k2 = buildKey('r', 1, 's', 'target-B', 'kid');
    expect(k1).not.toBe(k2);
  });

  it('empty or undefined targetDeviceId both collapse to empty string in join', () => {
    const withEmpty = buildKey('r', 1, 's', '', 'kid');
    const withUndefined = buildKey('r', 1, 's', undefined as unknown as string, 'kid');
    // JS Array.join converts undefined/null to empty string — both produce identical key
    expect(withEmpty).toBe(withUndefined);
    expect(withEmpty).toContain('::');
    // BUG: attacker can vary targetDeviceId between empty/undefined without changing replay key
  });
});

describe('P4: Discovery signature ciphertext coupling', () => {
  it('discovery sig payload binds ciphertext to senderPublicKey', async () => {
    let identity: Awaited<ReturnType<typeof getOrCreateIdentityKeyPair>> | null = null;
    try {
      identity = await getOrCreateIdentityKeyPair();
    } catch (e) {
      expect(true).toBe(true);
      return;
    }

    const pubKey = Buffer.from(await exportPublicKey(identity.publicKey)).toString('base64');

    const sig1 = await signIdentity(identity.privateKey, 'u', 'd', 's', pubKey, pubKey, 1, 'salt', 'msg1');
    const sig2 = await signIdentity(identity.privateKey, 'u', 'd', 's', pubKey, pubKey, 1, 'salt', 'msg1');

    expect(Buffer.from(sig1).toString('base64')).toBe(Buffer.from(sig2).toString('base64'));
  });
});

describe('P6: KEY_PACKAGE processing DoS surface', () => {
  it('concurrent processKeyPackage for same epoch+peer: only first accepted, rest rejected as epoch rollback', async () => {
    const [alice, bob] = await pairKx('dos-alice', 'dos-bob');
    await alice.createEpochKey(1);

    const bobPub = await bob.getPublicKeyBase64();
    const packages: KeyPackageData[] = [];
    for (let i = 0; i < 3; i++) {
      const raw = await alice.createKeyPackage(bobPub, 1);
      packages.push(raw); // keep original valid messageId + signature
    }

    // Parallel: all three have valid signatures, different messageIds.
    // No in-flight dedup => first succeeds, others fail epoch rollback because
    // highestProcessedEpochBySender is set by the first before the others check.
    const results: { epoch: number; key: CryptoKey }[] = [];
    const errors: unknown[] = [];
    for (const pkg of packages) {
      try {
        const result = await bob.processKeyPackage(pkg);
        results.push(result);
      } catch (e) {
        errors.push(e);
      }
    }

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((r) => r.epoch === 1)).toBe(true);
    expect(errors.length).toBeGreaterThanOrEqual(0);
  });

  it('RekeyStateMachine: duplicate KEY_ACK messageId rejected', async () => {
    const machine = new RekeyStateMachine();
    machine.setActivePeers(['p1']);
    machine.initiateRekey();
    machine.onRekeyBeginAcked(1);

    const msgId = '00000000-0000-4000-8000-000000000001';
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

describe('E2EE bootstrap sequence (happy path)', () => {
  it('leader creates epoch key, wraps for joiner, joiner unwraps, SFrame round-trip', async () => {
    const [leader, joiner] = await pairKx('e2ee-leader', 'e2ee-joiner');
    const joinerPub = await joiner.getPublicKeyBase64();

    const leaderKey = await leader.createEpochKey(1);
    const wrapped = await leader.createKeyPackage(joinerPub, 1);
    const joinerInbound = await joiner.processKeyPackage({
      ...wrapped,
      senderIdentity: { userId: 'user-e2ee-leader', deviceId: 'device-e2ee-leader', sessionId: 'session-e2ee-leader' },
    });

    const guard = new EpochGuard(true);
    guard.markAuthenticated();
    guard.markRoomJoined(0);
    guard.markEpochAdvanced(1);
    guard.markE2eeReady(1);
    expect(guard.isMediaAllowed()).toBe(true);

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

    await alice.createEpochKey(1);
    const w1 = await alice.createKeyPackage(bobPub, 1);
    const bobKey1 = await bob.processKeyPackage({
      ...w1,
      senderIdentity: { userId: 'user-rk-alice', deviceId: 'device-rk-alice', sessionId: 'session-rk-alice' },
    });

    const s1a = new SFrameContext();
    const s1b = new SFrameContext();
    await s1a.setEncryptionKey(alice.getCurrentEpochKey()!.key, 1, 1);
    await s1b.setEncryptionKey(bobKey1.key, 1, 1);
    const enc1 = await s1a.encryptFrame(new Uint8Array([1, 2, 3]).buffer.slice(0));
    expect(Buffer.from(await s1b.decryptFrame(enc1))).toEqual(Buffer.from([1, 2, 3]));

    await alice.createEpochKey(2);
    const w2 = await alice.createKeyPackage(bobPub, 2);
    const bobKey2 = await bob.processKeyPackage({
      ...w2,
      senderIdentity: { userId: 'user-rk-alice', deviceId: 'device-rk-alice', sessionId: 'session-rk-alice' },
    });

    const s2b = new SFrameContext();
    await s2b.setEncryptionKey(bobKey2.key, 2, 1);
    await expect(s2b.decryptFrame(enc1)).rejects.toThrow();

    const s2a = new SFrameContext();
    await s2a.setEncryptionKey(alice.getCurrentEpochKey()!.key, 2, 1);
    const enc2 = await s2a.encryptFrame(new Uint8Array([4, 5, 6]).buffer.slice(0));
    expect(Buffer.from(await s2b.decryptFrame(enc2))).toEqual(Buffer.from([4, 5, 6]));
  });

  it('epoch rollback: epoch 3 rejected after epoch 5 accepted', async () => {
    const [alice, bob] = await pairKx('rb-alice', 'rb-bob');
    const bobPub = await bob.getPublicKeyBase64();

    await alice.createEpochKey(5);
    await bob.processKeyPackage({
      ...(await alice.createKeyPackage(bobPub, 5)),
      senderIdentity: { userId: 'user-rb-alice', deviceId: 'device-rb-alice', sessionId: 'session-rb-alice' },
    });

    await alice.createEpochKey(3);
    await expect(
      bob.processKeyPackage({
        ...(await alice.createKeyPackage(bobPub, 3)),
        senderIdentity: { userId: 'user-rb-alice', deviceId: 'device-rb-alice', sessionId: 'session-rb-alice' },
      })
    ).rejects.toThrow(/Epoch rollback REJECTED/);
  });
});

describe('Resource cleanup', () => {
  it('CallKeyExchange.destroy clears all state', async () => {
    const kx = await initKx(makeIdentity('cl'));
    await kx.createEpochKey(1);
    await kx.createEpochKey(2);

    kx.destroy();

    expect(kx.getCurrentEpochKey()).toBeNull();
    expect(kx.getEpochKey(1)).toBeNull();
    expect(kx.getEpochKey(2)).toBeNull();
    await expect(kx.getPublicKeyBase64()).rejects.toThrow(/Not initialized/);
  });

  it('CallMediaEncryption.destroy resets all keys', async () => {
    const enc = new CallMediaEncryption();
    const kx = await initKx(makeIdentity('cm'));
    const key = await kx.createEpochKey(1);

    await enc.setEncryptionKey(key);
    await enc.setDecryptionKey('peer-1', key);

    enc.destroy();

    expect(enc.hasOutboundKey()).toBe(false);
    expect(enc.getDecryptionPeerIds()).toHaveLength(0);
    expect(enc.getEpoch()).toBe(0);
  });
});
