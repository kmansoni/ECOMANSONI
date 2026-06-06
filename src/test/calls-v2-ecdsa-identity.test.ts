import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  assertPeerIdentityPinned,
  exportPublicKey,
  getOrCreateIdentityKeyPair,
} from '../calls-v2/ecdsaIdentity';

describe('calls-v2 ecdsaIdentity TOFU pinning', () => {
  it('pins first seen peer identity and accepts the same key again', async () => {
    const pair = await getOrCreateIdentityKeyPair();
    const jwk = await exportPublicKey(pair.publicKey);
    const userId = `user-${crypto.randomUUID()}`;
    const deviceId = `device-${crypto.randomUUID()}`;

    const first = await assertPeerIdentityPinned(userId, deviceId, jwk);
    const second = await assertPeerIdentityPinned(userId, deviceId, jwk);

    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });

  it('rejects identity key change for already pinned user device', async () => {
    const firstPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign', 'verify'],
    );
    const secondPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign', 'verify'],
    );
    const firstJwk = await exportPublicKey(firstPair.publicKey);
    const secondJwk = await exportPublicKey(secondPair.publicKey);
    const userId = `user-${crypto.randomUUID()}`;
    const deviceId = `device-${crypto.randomUUID()}`;

    await assertPeerIdentityPinned(userId, deviceId, firstJwk);

    await expect(assertPeerIdentityPinned(userId, deviceId, secondJwk)).rejects.toThrow('TOFU pin mismatch');
  });
});
