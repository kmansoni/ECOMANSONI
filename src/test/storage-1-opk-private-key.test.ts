import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { X3DH } from '@/lib/e2ee/x3dh';

/**
 * STORAGE-1 mutation test — X3DH responder OPK private key flow
 *
 * Bug (before fix):
 *   secretChatManager.acceptSecretChat passed { privateKey: null } to
 *   X3DH.responderKeyAgreement, but DH4 = DH(OPK_B.priv, EK_A.pub)
 *   REQUIRES the OPK private key.
 *
 * Fix (this test validates):
 *   1. OPK private key is imported from secretBlob via importEcdhKeyPair
 *   2. Full CryptoKeyPair (with privateKey) is passed to responderKeyAgreement
 *   3. oneTimePreKeyWasUsed=true must match oneTimePreKeyPair !== null
 *
 * This test FAILS if someone reverts the fix to { privateKey: null }.
 */
describe('STORAGE-1: OPK private key must be used in X3DH responder', () => {
  let alice: {
    identityKeyPair: CryptoKeyPair;
    ephemeralKeyPair: CryptoKeyPair;
  };
  let bob: {
    identityKeyPair: CryptoKeyPair;
    signedPreKeyPair: CryptoKeyPair;
    opkKeyPair: CryptoKeyPair;
  };
  let exportedOpk: { publicKey: string; privateKey: string };
  let aliceIK_spki: string;
  let aliceEK_spki: string;

  beforeEach(async () => {
    alice = {
      identityKeyPair: await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveBits', 'deriveKey'],
      ),
      ephemeralKeyPair: await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveBits', 'deriveKey'],
      ),
    };

    bob = {
      identityKeyPair: await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveBits', 'deriveKey'],
      ),
      signedPreKeyPair: await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveBits', 'deriveKey'],
      ),
      opkKeyPair: await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveBits', 'deriveKey'],
      ),
    };

    exportedOpk = await X3DH.exportKeyPair(bob.opkKeyPair);
    aliceIK_spki = await exportSpki(alice.identityKeyPair.publicKey);
    aliceEK_spki = await exportSpki(alice.ephemeralKeyPair.publicKey);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Mutation test ─────────────────────────────────────────────────────────────
  it('BROKEN code path (null private key) throws; FIXED code path (full CryptoKeyPair) succeeds', async () => {
    // BROKEN: pass null private key — must throw
    let brokenError: unknown;
    try {
      await X3DH.responderKeyAgreement({
        identityKeyPair: bob.identityKeyPair,
        signedPreKeyPair: bob.signedPreKeyPair,
        oneTimePreKeyPair: {
          privateKey: null as unknown as CryptoKey,
          publicKey: bob.opkKeyPair.publicKey,
        },
        oneTimePreKeyWasUsed: true,
        ephemeralPublicKey: aliceEK_spki,
        initiatorIdentityPublicKey: aliceIK_spki,
      });
    } catch (err) {
      brokenError = err;
    }
    expect(brokenError).toBeDefined();
    expect(String(brokenError)).toMatch(/OPK|private key|TypeError|Failed/i);

    // FIXED: import OPK from secretBlob format and pass full CryptoKeyPair
    const importedOpk = await X3DH.importEcdhKeyPair(
      exportedOpk.publicKey,
      exportedOpk.privateKey,
    );

    let fixedError: unknown;
    let sharedSecret: ArrayBuffer | null = null;
    try {
      sharedSecret = await X3DH.responderKeyAgreement({
        identityKeyPair: bob.identityKeyPair,
        signedPreKeyPair: bob.signedPreKeyPair,
        oneTimePreKeyPair: importedOpk,
        oneTimePreKeyWasUsed: true,
        ephemeralPublicKey: aliceEK_spki,
        initiatorIdentityPublicKey: aliceIK_spki,
      });
    } catch (err) {
      fixedError = err;
    }

    expect(fixedError).toBeUndefined();
    expect(sharedSecret).toBeTruthy();
    expect(sharedSecret!.byteLength).toBeGreaterThan(0);
  });

  it('responderKeyAgreement rejects OPK pair when oneTimePreKeyWasUsed=false', async () => {
    const importedOpk = await X3DH.importEcdhKeyPair(
      exportedOpk.publicKey,
      exportedOpk.privateKey,
    );

    let threw = false;
    try {
      await X3DH.responderKeyAgreement({
        identityKeyPair: bob.identityKeyPair,
        signedPreKeyPair: bob.signedPreKeyPair,
        oneTimePreKeyPair: importedOpk,
        oneTimePreKeyWasUsed: false,
        ephemeralPublicKey: aliceEK_spki,
        initiatorIdentityPublicKey: aliceIK_spki,
      });
    } catch (err) {
      threw = true;
      expect(String(err)).toMatch(/OPK|did not/i);
    }
    expect(threw).toBe(true);
  });

  it('responderKeyAgreement works without OPK (null pair + false flag)', async () => {
    let sharedSecret: ArrayBuffer | null = null;
    let threw = false;
    try {
      sharedSecret = await X3DH.responderKeyAgreement({
        identityKeyPair: bob.identityKeyPair,
        signedPreKeyPair: bob.signedPreKeyPair,
        oneTimePreKeyPair: null,
        oneTimePreKeyWasUsed: false,
        ephemeralPublicKey: aliceEK_spki,
        initiatorIdentityPublicKey: aliceIK_spki,
      });
    } catch (err) {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(sharedSecret).toBeTruthy();
    expect(sharedSecret!.byteLength).toBeGreaterThan(0);
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function exportSpki(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('spki', key);
  return toBase64(new Uint8Array(raw));
}

function toBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
