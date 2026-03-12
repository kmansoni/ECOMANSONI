/**
 * Unit тесты для X3DH (Extended Triple Diffie-Hellman) Key Agreement Protocol
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { X3DH } from '../lib/e2ee/x3dh';

describe('X3DH Key Agreement', () => {
  describe('Key Generation', () => {
    it('generateIdentityKey — создаёт P-256 ECDH key pair', async () => {
      const keyPair = await X3DH.generateIdentityKey();
      
      expect(keyPair.publicKey).toBeTruthy();
      expect(keyPair.privateKey).toBeTruthy();
      expect(keyPair.publicKey.type).toBe('public');
      expect(keyPair.privateKey.type).toBe('private');
    });

    it('generateSignedPreKey — создаёт PreKey', async () => {
      const keyPair = await X3DH.generateSignedPreKey();
      
      expect(keyPair.publicKey).toBeTruthy();
      expect(keyPair.privateKey).toBeTruthy();
    });

    it('generateOneTimePreKey — создаёт одноразовый PreKey', async () => {
      const keyPair = await X3DH.generateOneTimePreKey();
      
      expect(keyPair.publicKey).toBeTruthy();
      expect(keyPair.privateKey).toBeTruthy();
    });
  });

  describe('Full X3DH Protocol', () => {
    let aliceIdentity: CryptoKeyPair;
    let bobBundle: Awaited<ReturnType<typeof X3DH.publishPreKeyBundle>>;
    let bobIdentity: CryptoKeyPair;
    let bobSigning: CryptoKeyPair;
    let bobSignedPreKey: CryptoKeyPair;
    let bobOneTimePreKey: CryptoKeyPair;

    beforeEach(async () => {
      // Setup Alice (initiator)
      aliceIdentity = await X3DH.generateIdentityKey();

      // Setup Bob (responder)
      bobIdentity = await X3DH.generateIdentityKey();
      
      // ECDSA ключ для подписей
      bobSigning = await crypto.subtle.generateKey(
        { name: 'ECDSA', hash: 'SHA-256', namedCurve: 'P-256' },
        true,
        ['sign', 'verify']
      );
      
      bobSignedPreKey = await X3DH.generateSignedPreKey();
      bobOneTimePreKey = await X3DH.generateOneTimePreKey();

      bobBundle = await X3DH.publishPreKeyBundle({
        identitySigningKey: bobSigning.privateKey,
        identityEcdhPublic: bobIdentity.publicKey,
        identitySigningPublic: bobSigning.publicKey,
        signedPreKey: bobSignedPreKey,
        oneTimePreKeys: [bobOneTimePreKey]
      });
    });

    function buildSessionBundleWithOpk() {
      return X3DH.createSessionBundle({
        bundle: bobBundle.bundle,
        oneTimePreKeyPublic: bobBundle.oneTimePreKeyPublics[0],
        oneTimePreKeyId: 'opk-1',
      });
    }

    it('initiatorKeyAgreement — Alice создаёт shared secret', async () => {
      const result = await X3DH.initiatorKeyAgreement(
        aliceIdentity,
        buildSessionBundleWithOpk(),
        bobBundle.identitySigningPublic
      );

      expect(result.sharedSecret).toBeTruthy();
      expect(result.sharedSecret.byteLength).toBeGreaterThan(0);
      expect(result.ephemeralPublicKey).toBeTruthy();
      expect(result.identityPublicKey).toBeTruthy();
    });

    it('responderKeyAgreement — Bob вычисляет тот же shared secret', async () => {
      // Alice инициирует
      const initiatorResult = await X3DH.initiatorKeyAgreement(
        aliceIdentity,
        buildSessionBundleWithOpk(),
        bobBundle.identitySigningPublic
      );

      // Bob отвечает - ВАЖНО: использует те же ключи что были в bundle!
      const bobSharedSecret = await X3DH.responderKeyAgreement({
        identityKeyPair: bobIdentity,
        signedPreKeyPair: bobSignedPreKey, // Тот же ключ что в bundle
        oneTimePreKeyPair: bobOneTimePreKey, // Тот же ключ что в bundle
        oneTimePreKeyWasUsed: true,
        ephemeralPublicKey: initiatorResult.ephemeralPublicKey,
        initiatorIdentityPublicKey: initiatorResult.identityPublicKey
      });

      expect(bobSharedSecret).toBeTruthy();
      
      // Secrets должны совпадать
      const aliceSecret = new Uint8Array(initiatorResult.sharedSecret);
      const bobSecret = new Uint8Array(bobSharedSecret);
      expect(aliceSecret).toEqual(bobSecret);
    });

    it('responderKeyAgreement — Bob вычисляет тот же shared secret без OPK', async () => {
      const initiatorResult = await X3DH.initiatorKeyAgreement(
        aliceIdentity,
        bobBundle.bundle,
        bobBundle.identitySigningPublic
      );

      const bobSharedSecret = await X3DH.responderKeyAgreement({
        identityKeyPair: bobIdentity,
        signedPreKeyPair: bobSignedPreKey,
        oneTimePreKeyPair: null,
        oneTimePreKeyWasUsed: false,
        ephemeralPublicKey: initiatorResult.ephemeralPublicKey,
        initiatorIdentityPublicKey: initiatorResult.identityPublicKey
      });

      expect(new Uint8Array(initiatorResult.sharedSecret)).toEqual(new Uint8Array(bobSharedSecret));
    });

    it('каждый сеанс создаёт РАЗНЫЙ shared secret (forward secrecy)', async () => {
      const result1 = await X3DH.initiatorKeyAgreement(
        aliceIdentity,
        buildSessionBundleWithOpk(),
        bobBundle.identitySigningPublic
      );

      // Новый bundle для второго сеанса
      const newOpk = await X3DH.generateOneTimePreKey();
      const newBundle = await X3DH.publishPreKeyBundle({
        identitySigningKey: bobSigning.privateKey,
        identityEcdhPublic: bobIdentity.publicKey,
        identitySigningPublic: bobSigning.publicKey,
        signedPreKey: await X3DH.generateSignedPreKey(),
        oneTimePreKeys: [newOpk]
      });

      const result2 = await X3DH.initiatorKeyAgreement(
        aliceIdentity,
        X3DH.createSessionBundle({
          bundle: newBundle.bundle,
          oneTimePreKeyPublic: newBundle.oneTimePreKeyPublics[0],
          oneTimePreKeyId: 'opk-2',
        }),
        newBundle.identitySigningPublic
      );

      // Secrets должны быть разными
      const secret1 = new Uint8Array(result1.sharedSecret);
      const secret2 = new Uint8Array(result2.sharedSecret);
      expect(secret1).not.toEqual(secret2);
    });

    it('reject tampered signature', async () => {
      const tamperedBundle = {
        ...bobBundle.bundle,
        signedPreKeySignature: 'INVALID_SIGNATURE'
      };

      await expect(
        X3DH.initiatorKeyAgreement(
          aliceIdentity,
          tamperedBundle as any,
          bobBundle.identitySigningPublic
        )
      ).rejects.toThrow();
    });

    it('reject responder flow when session used OPK but responder key is missing', async () => {
      const initiatorResult = await X3DH.initiatorKeyAgreement(
        aliceIdentity,
        buildSessionBundleWithOpk(),
        bobBundle.identitySigningPublic
      );

      await expect(
        X3DH.responderKeyAgreement({
          identityKeyPair: bobIdentity,
          signedPreKeyPair: bobSignedPreKey,
          oneTimePreKeyPair: null,
          oneTimePreKeyWasUsed: true,
          ephemeralPublicKey: initiatorResult.ephemeralPublicKey,
          initiatorIdentityPublicKey: initiatorResult.identityPublicKey,
        })
      ).rejects.toThrow(/missing consumed OPK/i);
    });
  });
});
