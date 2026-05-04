// Test vectors for X3DH using libsodium-wrappers to generate keys
import { describe, it, expect, beforeAll } from 'vitest';
import sodium from 'libsodium-wrappers';
import { x3dh, X3DHKeyBundle } from '../crypto/x3dh';

describe('X3DH', () => {
  let sodiumInstance: any;
  let aliceIk: { privateKey: Uint8Array; publicKey: Uint8Array };
  let aliceSpk: { privateKey: Uint8Array; publicKey: Uint8Array };
  let aliceSpkSig: Uint8Array;
  let aliceOpk: { privateKey: Uint8Array; publicKey: Uint8Array }[];

  let bobIk: { privateKey: Uint8Array; publicKey: Uint8Array };
  let bobSpk: { privateKey: Uint8Array; publicKey: Uint8Array };
  let bobSpkSig: Uint8Array;
  let bobOpk: { privateKey: Uint8Array; publicKey: Uint8Array }[];

  beforeAll(async () => {
    sodiumInstance = await sodium;
    // Helper to generate a random Curve25519 key pair
    const generateKeyPair = () => {
      const privateKey = sodiumInstance.randombytes_buf(sodiumInstance.crypto_scalarmult_SCALARBYTES);
      const publicKey = sodiumInstance.crypto_scalarmult_base(privateKey);
      return { privateKey, publicKey };
    };

    // Generate Alice's keys
    aliceIk = generateKeyPair();
    aliceSpk = generateKeyPair();
    // For simplicity, we set the signature to zero (we are not verifying it in this test)
    aliceSpkSig = new Uint8Array(64).fill(0);
    // Generate 3 one-time prekeys for Alice
    aliceOpk = [
      generateKeyPair(),
      generateKeyPair(),
      generateKeyPair()
    ];

    // Generate Bob's keys
    bobIk = generateKeyPair();
    bobSpk = generateKeyPair();
    bobSpkSig = new Uint8Array(64).fill(0);
    bobOpk = [
      generateKeyPair(),
      generateKeyPair(),
      generateKeyPair()
    ];
  });

  it('should produce the same shared secret from both sides', async () => {
    // Alice uses Bob's first one-time prekey
    const aliceResult = await x3dh(
      { ik: aliceIk, spk: aliceSpk, spkSig: aliceSpkSig, opk: aliceOpk },
      { ik: bobIk, spk: bobSpk, spkSig: bobSpkSig, opk: bobOpk },
      0 // Alice uses Bob's first OPK
    );

    // Bob uses Alice's first one-time prekey
    const bobResult = await x3dh(
      { ik: bobIk, spk: bobSpk, spkSig: bobSpkSig, opk: bobOpk },
      { ik: aliceIk, spk: aliceSpk, spkSig: aliceSpkSig, opk: aliceOpk },
      0 // Bob uses Alice's first OPK
    );

    // The shared secrets should be equal
    expect(sodiumInstance.to_hex(aliceResult.sharedSecret)).toBe(sodiumInstance.to_hex(bobResult.sharedSecret));
    // The send and receive keys should be swapped (Alice's send key should equal Bob's receive key and vice versa)
    // Note: In our X3DH function we derived sendKey as the second half and recvKey as the first half of the shared secret.
    // So if the shared secret is the same, then the sendKey of Alice should equal the recvKey of Bob and vice versa.
    expect(sodiumInstance.to_hex(aliceResult.sendKey)).toBe(sodiumInstance.to_hex(bobResult.recvKey));
    expect(sodiumInstance.to_hex(aliceResult.recvKey)).toBe(sodiumInstance.to_hex(bobResult.sendKey));
  });

  it('should return keys of correct length', async () => {
    const result = await x3dh(
      { ik: aliceIk, spk: aliceSpk, spkSig: aliceSpkSig, opk: aliceOpk },
      { ik: bobIk, spk: bobSpk, spkSig: bobSpkSig, opk: bobOpk },
      0
    );
    expect(result.sharedSecret.length).toBe(32);
    expect(result.sendKey.length).toBe(16);
    expect(result.recvKey.length).toBe(16);
  });
});