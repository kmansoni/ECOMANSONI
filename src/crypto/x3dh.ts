// X3DH (Extended Triple Diffie-Hellman) implementation using libsodium-wrappers
import sodium from 'libsodium-wrappers';

export interface X3DHKeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface X3DHKeyBundle {
  ik: X3DHKeyPair; // Identity Key
  spk: X3DHKeyPair; // Signed PreKey (also serves as ephemeral key)
  spkSig: Uint8Array; // Signature of SPK by IK (Ed25519 signature)
  opk: X3DHKeyPair[]; // One-time PreKeys
}

/**
 * Perform X3DH key agreement
 * @param my  - own identity key, signed preKey, signature, and list of one-time preKeys
 * @param their - peer's identity key, signed preKey, signature, and one-time preKeys
 * @param theirOpkIndex - optional index of the one-time preKey from their bundle that was used (if any)
 * @returns shared secret and initial ratchet keys
 */
export async function x3dh(
  my: X3DHKeyBundle,
  their: X3DHKeyBundle,
  theirOpkIndex: number | null = null
): Promise<{ sharedSecret: Uint8Array; sendKey: Uint8Array; recvKey: Uint8Array }> {
  const sodiumInstance = await sodium;

  // Helper to compute DH: privateKey * publicKey
  const dh = (privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array => {
    return sodiumInstance.crypto_scalarmult(privateKey, publicKey);
  };

  // Helper to concatenate Uint8Arrays
  const concatUint8Arrays = (arrays: Uint8Array[]): Uint8Array => {
    let totalLength = 0;
    for (const arr of arrays) {
      totalLength += arr.length;
    }
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }
    return result;
  };

  // DH1 = DH(IK_A, SPK_B)
  const dh1 = dh(my.ik.privateKey, their.spk.publicKey);
  // DH2 = DH(EK_A, IK_B) where EK_A is the private part of SPK (treated as ephemeral)
  const dh2 = dh(my.spk.privateKey, their.ik.publicKey);
  // DH3 = DH(EK_A, SPK_B)
  const dh3 = dh(my.spk.privateKey, their.spk.publicKey);
  // DH4 = DH(EK_A, OPK_B) if OPK provided
  let dh4 = new Uint8Array(0);
  if (theirOpkIndex !== null && theirOpkIndex >= 0 && theirOpkIndex < their.opk.length) {
    dh4 = dh(my.spk.privateKey, their.opk[theirOpkIndex].publicKey);
  }

  // Concatenate all DH outputs
  const dhVals = concatUint8Arrays([dh1, dh2, dh3, dh4]);

  // Derive shared secret using HKDF (using sodium.crypto_generichash as KDF)
  // We'll use a fixed context string 'x3dh' prefixed to the input to act as HKDF info
  const context = new TextEncoder().encode('x3dh');
  const input = concatUint8Arrays([context, dhVals]);
  const sharedSecret = sodiumInstance.crypto_generichash(32, input);

  // Derive ratchet keys: split shared secret into send and receive keys
  // Using HKDF-like: first 16 bytes for recv, next 16 for send (or vice versa)
  const recvKey = sharedSecret.slice(0, 16);
  const sendKey = sharedSecret.slice(16, 32);

  return { sharedSecret, sendKey, recvKey };
}