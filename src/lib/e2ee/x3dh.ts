/**
 * Extended Triple Diffie-Hellman (X3DH) Key Agreement Protocol
 *
 * Implements the Signal X3DH specification:
 * https://signal.org/docs/specifications/x3dh/
 *
 * Security properties:
 * - Mutual authentication: both parties' long-term identity keys participate
 * - Forward secrecy: one-time prekeys ensure per-session uniqueness
 * - Deniability: no explicit signatures in the derived secret
 * - Replay protection: one-time prekeys are consumed server-side (enforced via DB)
 *
 * Key types:
 * - IK  (Identity Key)      — long-term ECDH P-256
 * - SPK (Signed PreKey)     — medium-term, rotated, signed by IK (ECDSA P-256)
 * - OPK (One-Time PreKey)   — ephemeral, consumed once
 * - EK  (Ephemeral Key)     — sender-generated per session
 *
 * Key agreement (Alice → Bob):
 *   DH1 = DH(IK_A.priv, SPK_B.pub)
 *   DH2 = DH(EK_A.priv, IK_B.pub)
 *   DH3 = DH(EK_A.priv, SPK_B.pub)
 *   DH4 = DH(EK_A.priv, OPK_B.pub)  [omitted if no OPK available]
 *   SK  = KDF(DH1 || DH2 || DH3 [|| DH4])
 *
 * Bob's responder agreement:
 *   DH1 = DH(SPK_B.priv, IK_A.pub)
 *   DH2 = DH(IK_B.priv, EK_A.pub)
 *   DH3 = DH(SPK_B.priv, EK_A.pub)
 *   DH4 = DH(OPK_B.priv, EK_A.pub) [if OPK was used]
 *   SK  = KDF(DH1 || DH2 || DH3 [|| DH4])
 *
 * All keys use ECDH P-256 via Web Crypto API.
 * Signing uses ECDSA P-256 with SHA-256.
 */

import { toBase64, fromBase64 } from "./utils";

function toLocalBytesFromBase64(b64: string): Uint8Array {
  const raw = fromBase64(b64);
  return new Uint8Array(raw.slice(0));
}

// ── Public types ───────────────────────────────────────────────────────────

export interface PreKeyBundle {
  /** Identity public key (base64 SPKI) */
  identityKeyPublic: string;
  /** Signed pre-key public (base64 SPKI) */
  signedPreKeyPublic: string;
  /** ECDSA signature of signedPreKeyPublic bytes by identityKey (base64) */
  signedPreKeySignature: string;
  /** One-time pre-key public (base64 SPKI) — may be absent if exhausted */
  oneTimePreKeyPublic?: string;
  /** Opaque ID of OPK so server can delete it after use */
  oneTimePreKeyId?: string;
}

export interface InitiatorResult {
  /** Shared secret — feed into DoubleRatchetE2E.initAlice() */
  sharedSecret: ArrayBuffer;
  /** Initiator ephemeral public key (base64 SPKI) — must be sent to responder */
  ephemeralPublicKey: string;
  /** Identity public key of initiator (base64 SPKI) — for Bob's verification */
  identityPublicKey: string;
  /** OPK ID used, if any — server must mark consumed */
  oneTimePreKeyId?: string;
  /** OPK public key used for this session, if any */
  oneTimePreKeyPublic?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function generateECDHKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
}

async function generateECDSAKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
}

async function ecdhDeriveBytes(
  privateKey: CryptoKey,
  publicKey: CryptoKey
): Promise<ArrayBuffer> {
  return crypto.subtle.deriveBits(
    { name: "ECDH", public: publicKey },
    privateKey,
    256
  );
}

async function exportSpki(key: CryptoKey): Promise<string> {
  const buf = await crypto.subtle.exportKey("spki", key);
  return toBase64(new Uint8Array(buf));
}

async function importEcdhPublic(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    toLocalBytesFromBase64(b64),
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );
}

async function importEcdsaPublic(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    toLocalBytesFromBase64(b64),
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"]
  );
}

/**
 * X3DH KDF: HKDF-SHA-256 over concatenated DH outputs.
 * F is a 32-byte all-0xFF padding prepended (Signal spec convention for
 * curve25519; for P-256 we keep the same structure for domain separation).
 */
async function x3dhKDF(dhConcat: ArrayBuffer): Promise<ArrayBuffer> {
  const F = new Uint8Array(32).fill(0xff);
  const ikm = new Uint8Array(F.byteLength + dhConcat.byteLength);
  ikm.set(F, 0);
  ikm.set(new Uint8Array(dhConcat), F.byteLength);

  const ikmKey = await crypto.subtle.importKey(
    "raw",
    ikm,
    { name: "HKDF" },
    false,
    ["deriveBits"]
  );

  const info = new TextEncoder().encode("WhisperX3DH");
  const salt = new Uint8Array(32); // zero salt

  return crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    ikmKey,
    256
  );
}

function concatBuffers(...bufs: ArrayBuffer[]): ArrayBuffer {
  const total = bufs.reduce((sum, b) => sum + b.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of bufs) {
    out.set(new Uint8Array(b), offset);
    offset += b.byteLength;
  }
  return out.buffer;
}

// ── X3DH class ─────────────────────────────────────────────────────────────

export class X3DH {
  /**
   * Convert a published pre-key bundle into a concrete session bundle.
   * This makes the chosen OPK explicit so both sides derive over the same DH set.
   */
  static createSessionBundle(params: {
    bundle: Omit<PreKeyBundle, "oneTimePreKeyPublic" | "oneTimePreKeyId">;
    oneTimePreKeyPublic?: string;
    oneTimePreKeyId?: string;
  }): PreKeyBundle {
    return {
      ...params.bundle,
      ...(params.oneTimePreKeyPublic ? { oneTimePreKeyPublic: params.oneTimePreKeyPublic } : {}),
      ...(params.oneTimePreKeyId ? { oneTimePreKeyId: params.oneTimePreKeyId } : {}),
    };
  }

  /**
   * Generate a long-term identity key pair (ECDH P-256).
   * Must be persisted securely (encrypted in localStorage / secure storage).
   */
  static async generateIdentityKey(): Promise<CryptoKeyPair> {
    return generateECDHKeyPair();
  }

  /**
   * Generate a signed pre-key pair (ECDH P-256).
   * Rotated periodically (e.g. weekly). Signature verified by initiators.
   */
  static async generateSignedPreKey(): Promise<CryptoKeyPair> {
    return generateECDHKeyPair();
  }

  /**
   * Generate a one-time pre-key pair (ECDH P-256).
   * Each key is generated once and consumed exactly once.
   * Batch-generate ahead of time and publish to server.
   */
  static async generateOneTimePreKey(): Promise<CryptoKeyPair> {
    return generateECDHKeyPair();
  }

  /**
   * Sign the signed pre-key public bytes using the identity key (ECDSA).
   * The identity key must be an ECDSA key for signing.
   * 
   * Architecture note: We use two separate P-256 key pairs for IK:
   * - IK_ECDH: for DH operations in X3DH
   * - IK_ECDSA: for signing SPK
   * Both are published together in the bundle.
   */
  static async signPreKey(
    identitySigningKey: CryptoKey,
    signedPreKeyPublic: CryptoKey
  ): Promise<string> {
    const spkiBytes = await crypto.subtle.exportKey("spki", signedPreKeyPublic);
    const sig = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      identitySigningKey,
      spkiBytes
    );
    return toBase64(new Uint8Array(sig));
  }

  /**
   * Verify SPK signature.
   * Must be called by initiator before proceeding with key agreement.
   * Attack vector: MITM substituting SPK → breaks forward secrecy.
   */
  static async verifyPreKeySignature(
    identitySigningPublicKey: string,
    signedPreKeyPublicB64: string,
    signature: string
  ): Promise<boolean> {
    const verifyKey = await importEcdsaPublic(identitySigningPublicKey);
    const spkiBytes = toLocalBytesFromBase64(signedPreKeyPublicB64);
    return crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      verifyKey,
      toLocalBytesFromBase64(signature),
      spkiBytes
    );
  }

  /**
   * Build a PreKeyBundle for publishing to the server.
   * identitySigningKey: ECDSA private key for signing SPK
   * identityEcdhPublic: ECDH public key (DH operations)
   * signedPreKey: ECDH key pair
   * oneTimePreKeys: array of ECDH key pairs
   */
  static async publishPreKeyBundle(params: {
    identitySigningKey: CryptoKey;
    identityEcdhPublic: CryptoKey;
    identitySigningPublic: CryptoKey;
    signedPreKey: CryptoKeyPair;
    oneTimePreKeys: CryptoKeyPair[];
  }): Promise<{
    bundle: Omit<PreKeyBundle, "oneTimePreKeyPublic" | "oneTimePreKeyId">;
    oneTimePreKeyPublics: string[];
    identitySigningPublic: string;
  }> {
    const signedPreKeyPublicB64 = await exportSpki(params.signedPreKey.publicKey);
    const signature = await X3DH.signPreKey(
      params.identitySigningKey,
      params.signedPreKey.publicKey
    );

    const oneTimePreKeyPublics = await Promise.all(
      params.oneTimePreKeys.map(kp => exportSpki(kp.publicKey))
    );

    const identityEcdhPublicB64 = await exportSpki(params.identityEcdhPublic);
    const identitySigningPublicB64 = await exportSpki(params.identitySigningPublic);

    return {
      bundle: {
        identityKeyPublic: identityEcdhPublicB64,
        signedPreKeyPublic: signedPreKeyPublicB64,
        signedPreKeySignature: signature,
      },
      oneTimePreKeyPublics,
      identitySigningPublic: identitySigningPublicB64,
    };
  }

  /**
   * Initiator (Alice) performs key agreement against Bob's PreKeyBundle.
   *
   * Attack mitigations:
   * - SPK signature verified before use → MITM prevention
   * - OPK consumed once server-side → replay prevention
   * - EK freshly generated → per-session forward secrecy
   */
  static async initiatorKeyAgreement(
    initiatorIdentityKeyPair: CryptoKeyPair,
    bundle: PreKeyBundle,
    bundleSigningPublic: string
  ): Promise<InitiatorResult> {
    // 1. Verify SPK signature (mandatory)
    const valid = await X3DH.verifyPreKeySignature(
      bundleSigningPublic,
      bundle.signedPreKeyPublic,
      bundle.signedPreKeySignature
    );
    if (!valid) {
      throw new Error("X3DH: SPK signature verification failed — possible MITM");
    }

    // 2. Import Bob's keys
    const bobIK = await importEcdhPublic(bundle.identityKeyPublic);
    const bobSPK = await importEcdhPublic(bundle.signedPreKeyPublic);
    const bobOPK = bundle.oneTimePreKeyPublic
      ? await importEcdhPublic(bundle.oneTimePreKeyPublic)
      : null;

    // 3. Generate ephemeral key
    const ephemeralKeyPair = await generateECDHKeyPair();

    // 4. Perform DH computations
    // DH1 = DH(IK_A, SPK_B)
    const dh1 = await ecdhDeriveBytes(initiatorIdentityKeyPair.privateKey, bobSPK);
    // DH2 = DH(EK_A, IK_B)
    const dh2 = await ecdhDeriveBytes(ephemeralKeyPair.privateKey, bobIK);
    // DH3 = DH(EK_A, SPK_B)
    const dh3 = await ecdhDeriveBytes(ephemeralKeyPair.privateKey, bobSPK);

    let dhMaterial: ArrayBuffer;
    if (bobOPK) {
      // DH4 = DH(EK_A, OPK_B)
      const dh4 = await ecdhDeriveBytes(ephemeralKeyPair.privateKey, bobOPK);
      dhMaterial = concatBuffers(dh1, dh2, dh3, dh4);
    } else {
      dhMaterial = concatBuffers(dh1, dh2, dh3);
    }

    const sharedSecret = await x3dhKDF(dhMaterial);

    return {
      sharedSecret,
      ephemeralPublicKey: await exportSpki(ephemeralKeyPair.publicKey),
      identityPublicKey: await exportSpki(initiatorIdentityKeyPair.publicKey),
      oneTimePreKeyId: bundle.oneTimePreKeyId,
      oneTimePreKeyPublic: bundle.oneTimePreKeyPublic,
    };
  }

  /**
   * Responder (Bob) performs key agreement given Alice's ephemeral key and IK.
   * Produces the same shared secret as the initiator.
   *
   * Security: Bob must verify that identityPublicKey matches known contact IK
   * before trusting the session. First-use-TOFU or out-of-band verification.
   */
  static async responderKeyAgreement(params: {
    identityKeyPair: CryptoKeyPair;
    signedPreKeyPair: CryptoKeyPair;
    oneTimePreKeyPair: CryptoKeyPair | null;
    oneTimePreKeyWasUsed?: boolean;
    ephemeralPublicKey: string;
    initiatorIdentityPublicKey: string;
  }): Promise<ArrayBuffer> {
    if (params.oneTimePreKeyWasUsed === true && !params.oneTimePreKeyPair) {
      throw new Error("X3DH: responder missing consumed OPK private key for this session");
    }
    if (params.oneTimePreKeyWasUsed === false && params.oneTimePreKeyPair) {
      throw new Error("X3DH: responder received OPK private key for a session that did not use OPK");
    }

    const aliceIK = await importEcdhPublic(params.initiatorIdentityPublicKey);
    const aliceEK = await importEcdhPublic(params.ephemeralPublicKey);

    // DH1 = DH(SPK_B, IK_A)
    const dh1 = await ecdhDeriveBytes(params.signedPreKeyPair.privateKey, aliceIK);
    // DH2 = DH(IK_B, EK_A)
    const dh2 = await ecdhDeriveBytes(params.identityKeyPair.privateKey, aliceEK);
    // DH3 = DH(SPK_B, EK_A)
    const dh3 = await ecdhDeriveBytes(params.signedPreKeyPair.privateKey, aliceEK);

    let dhMaterial: ArrayBuffer;
    if (params.oneTimePreKeyPair) {
      // DH4 = DH(OPK_B, EK_A)
      const dh4 = await ecdhDeriveBytes(params.oneTimePreKeyPair.privateKey, aliceEK);
      dhMaterial = concatBuffers(dh1, dh2, dh3, dh4);
    } else {
      dhMaterial = concatBuffers(dh1, dh2, dh3);
    }

    return x3dhKDF(dhMaterial);
  }

  // ── Key serialization ──────────────────────────────────────────────────

  static async exportKeyPair(kp: CryptoKeyPair): Promise<{ publicKey: string; privateKey: string }> {
    const pub = await crypto.subtle.exportKey("spki", kp.publicKey);
    const priv = await crypto.subtle.exportKey("pkcs8", kp.privateKey);
    return {
      publicKey: toBase64(new Uint8Array(pub)),
      privateKey: toBase64(new Uint8Array(priv)),
    };
  }

  static async importEcdhKeyPair(
    publicB64: string,
    privateB64: string
  ): Promise<CryptoKeyPair> {
    const publicKey = await importEcdhPublic(publicB64);
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      toLocalBytesFromBase64(privateB64),
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"]
    );
    return { publicKey, privateKey };
  }

  static async importEcdsaKeyPair(
    publicB64: string,
    privateB64: string
  ): Promise<CryptoKeyPair> {
    const publicKey = await importEcdsaPublic(publicB64);
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      toLocalBytesFromBase64(privateB64),
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign"]
    );
    return { publicKey, privateKey };
  }

  /**
   * Generate a complete identity bundle for a new user device registration.
   * Returns all key pairs for local storage + bundle for server publication.
   */
  static async generateFullIdentityBundle(
    oneTimePreKeyCount: number = 10
  ): Promise<{
    identityEcdhKeyPair: CryptoKeyPair;
    identityEcdsaKeyPair: CryptoKeyPair;
    signedPreKeyPair: CryptoKeyPair;
    oneTimePreKeyPairs: CryptoKeyPair[];
    serverBundle: {
      identityKeyPublic: string;
      identitySigningPublic: string;
      signedPreKeyPublic: string;
      signedPreKeySignature: string;
      oneTimePreKeyPublics: string[];
    };
  }> {
    const identityEcdhKeyPair = await generateECDHKeyPair();
    const identityEcdsaKeyPair = await generateECDSAKeyPair();
    const signedPreKeyPair = await generateECDHKeyPair();

    const oneTimePreKeyPairs = await Promise.all(
      Array.from({ length: oneTimePreKeyCount }, () => generateECDHKeyPair())
    );

    const signedPreKeyPublic = await exportSpki(signedPreKeyPair.publicKey);
    const spkiBytes = await crypto.subtle.exportKey("spki", signedPreKeyPair.publicKey);
    const sigBuf = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      identityEcdsaKeyPair.privateKey,
      spkiBytes
    );

    const oneTimePreKeyPublics = await Promise.all(
      oneTimePreKeyPairs.map(kp => exportSpki(kp.publicKey))
    );

    return {
      identityEcdhKeyPair,
      identityEcdsaKeyPair,
      signedPreKeyPair,
      oneTimePreKeyPairs,
      serverBundle: {
        identityKeyPublic: await exportSpki(identityEcdhKeyPair.publicKey),
        identitySigningPublic: await exportSpki(identityEcdsaKeyPair.publicKey),
        signedPreKeyPublic,
        signedPreKeySignature: toBase64(new Uint8Array(sigBuf)),
        oneTimePreKeyPublics,
      },
    };
  }
}
