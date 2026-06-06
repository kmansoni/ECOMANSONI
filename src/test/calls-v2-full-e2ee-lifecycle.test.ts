/* @vitest-environment node */
/**
 * Full calls-v2 E2EE lifecycle integration:
 * identity exchange → discovery/wrapped epoch key → KEY_ACK/COMMIT readiness model →
 * SFrame encrypt/decrypt → replay reject → old frame reject after commit.
 */

import { describe, expect, it } from 'vitest';
import { CallKeyExchange } from '../calls-v2/callKeyExchange';
import { EpochGuard } from '../calls-v2/epochGuard';
import { SFrameContext } from '../lib/e2ee/sframe';

const aliceIdentity = { userId: 'alice-life', deviceId: 'alice-life-dev', sessionId: 'alice-life-session' };
const bobIdentity = { userId: 'bob-life', deviceId: 'bob-life-dev', sessionId: 'bob-life-session' };

async function exchangeSigningKeys(alice: CallKeyExchange, bob: CallKeyExchange) {
  await bob.registerPeerSigningKey(`${aliceIdentity.userId}:${aliceIdentity.deviceId}`, await alice.getSigningPublicKeyBase64());
  await alice.registerPeerSigningKey(`${bobIdentity.userId}:${bobIdentity.deviceId}`, await bob.getSigningPublicKeyBase64());
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function text(buffer: ArrayBuffer): string {
  return new TextDecoder().decode(buffer);
}

describe('calls-v2 full E2EE lifecycle integration', () => {
  it('identity → wrapped epoch key → E2EE_READY → encrypt/decrypt → replay reject → old frame reject after commit', async () => {
    const aliceKx = new CallKeyExchange(aliceIdentity);
    const bobKx = new CallKeyExchange(bobIdentity);
    await aliceKx.initialize();
    await bobKx.initialize();

    // 1. Identity/signing key exchange.
    await exchangeSigningKeys(aliceKx, bobKx);

    // 2. Discovery: public ECDH keys are available before wrapped epoch delivery.
    const aliceDiscoveryPub = await aliceKx.getPublicKeyBase64();
    const bobDiscoveryPub = await bobKx.getPublicKeyBase64();
    expect(aliceDiscoveryPub).toBeTruthy();
    expect(bobDiscoveryPub).toBeTruthy();

    // 3. Leader creates epoch key and wraps it for peer.
    const epoch1AliceKey = await aliceKx.createEpochKey(1);
    const wrappedEpoch1 = await aliceKx.createKeyPackage(bobDiscoveryPub, 1);
    expect(wrappedEpoch1.epoch).toBe(1);
    expect(wrappedEpoch1.senderIdentity).toEqual(aliceIdentity);

    // 4. Peer unwraps and installs inbound epoch key; this models KEY_ACK readiness.
    const epoch1BobKey = await bobKx.processKeyPackage(wrappedEpoch1);
    expect(epoch1BobKey.epoch).toBe(1);
    expect(epoch1BobKey.key.extractable).toBe(false);

    // 5. E2EE_READY gate opens only after auth + room + epoch readiness.
    const guard = new EpochGuard(true);
    guard.markAuthenticated();
    guard.markRoomJoined(0);
    guard.markEpochAdvanced(1);
    expect(() => guard.assertMediaAllowed('before E2EE_READY')).toThrow(/BLOCKED/);
    guard.markE2eeReady(1);
    expect(() => guard.assertMediaAllowed('after E2EE_READY')).not.toThrow();

    // 6. Encrypt/decrypt a media frame using SFrame with negotiated epoch key.
    const aliceSframe = new SFrameContext();
    const bobSframe = new SFrameContext();
    await aliceSframe.setEncryptionKey(epoch1AliceKey.key, 1, 1);
    await bobSframe.setEncryptionKey(epoch1BobKey.key, 1, 1);

    const plaintext = bytes('calls-v2 e2ee media frame epoch 1');
    const encryptedEpoch1 = await aliceSframe.encryptFrame(plaintext.buffer.slice(0));
    const decryptedEpoch1 = await bobSframe.decryptFrame(encryptedEpoch1);
    expect(text(decryptedEpoch1)).toBe('calls-v2 e2ee media frame epoch 1');

    // 7. Replay protection rejects duplicate SFrame counter.
    await expect(bobSframe.decryptFrame(encryptedEpoch1)).rejects.toThrow(/Duplicate SFrame counter/);

    // 8. Rekey commit advances epoch and old epoch frame cannot decrypt under new committed key.
    const epoch2AliceKey = await aliceKx.createEpochKey(2);
    const wrappedEpoch2 = await aliceKx.createKeyPackage(bobDiscoveryPub, 2);
    const epoch2BobKey = await bobKx.processKeyPackage(wrappedEpoch2);

    guard.markEpochAdvanced(2);
    expect(() => guard.assertMediaAllowed('during REKEY_COMMIT')).toThrow(/BLOCKED/);
    guard.markE2eeReady(2);
    expect(() => guard.assertMediaAllowed('after REKEY_COMMIT')).not.toThrow();

    const aliceSframeEpoch2 = new SFrameContext();
    const bobSframeEpoch2 = new SFrameContext();
    await aliceSframeEpoch2.setEncryptionKey(epoch2AliceKey.key, 2, 2);
    await bobSframeEpoch2.setEncryptionKey(epoch2BobKey.key, 2, 2);

    await expect(bobSframeEpoch2.decryptFrame(encryptedEpoch1)).rejects.toThrow();

    const encryptedEpoch2 = await aliceSframeEpoch2.encryptFrame(bytes('calls-v2 e2ee media frame epoch 2').buffer.slice(0));
    const decryptedEpoch2 = await bobSframeEpoch2.decryptFrame(encryptedEpoch2);
    expect(text(decryptedEpoch2)).toBe('calls-v2 e2ee media frame epoch 2');
  });
});
