import { describe, expect, it } from 'vitest';
import { signEnvelope, verifyEnvelope } from './signing';
import {
  computePeerId,
  generateIdentityKeyPair,
  importPublicKey,
  isEd25519Supported,
  base58Encode,
  base58Decode,
} from './identity';
import { asMeshMessageId, type MeshMessageEnvelope } from '../types';

async function makeSignedEnvelope(): Promise<{
  env: MeshMessageEnvelope;
  publicKey: Uint8Array;
}> {
  const { privateKey, publicKey } = await generateIdentityKeyPair();
  const senderId = await computePeerId(publicKey);
  const timestamp = 1_700_000_000_000;
  const nonce = 'dGVzdG5vbmNl'; // "testnonce" в base64
  const ciphertext = 'aGVsbG8='; // "hello"

  const headerForSign = {
    id: asMeshMessageId('m-1'),
    senderId,
    recipientId: 'broadcast' as const,
    kind: 'text' as const,
    priority: 1 as const,
    timestamp,
    maxHops: 10,
    ttlMs: 60_000,
  };

  const signature = await signEnvelope(privateKey, headerForSign, nonce, ciphertext);

  const env: MeshMessageEnvelope = {
    ...headerForSign,
    hopCount: 0,
    routePath: [senderId],
    ciphertext,
    nonce,
    signature,
  };

  return { env, publicKey };
}

describe('Ed25519 signing', () => {
  it('env окружение поддерживает Ed25519', async () => {
    expect(await isEd25519Supported()).toBe(true);
  });

  it('round-trip sign → verify = true', async () => {
    const { env, publicKey } = await makeSignedEnvelope();
    const ok = await verifyEnvelope(publicKey, env);
    expect(ok).toBe(true);
  });

  it('подделанный ciphertext → verify false', async () => {
    const { env, publicKey } = await makeSignedEnvelope();
    const tampered: MeshMessageEnvelope = { ...env, ciphertext: 'dGFtcGVyZWQ=' };
    const ok = await verifyEnvelope(publicKey, tampered);
    expect(ok).toBe(false);
  });

  it('чужой публичный ключ → verify false', async () => {
    const { env } = await makeSignedEnvelope();
    const { publicKey: other } = await generateIdentityKeyPair();
    const ok = await verifyEnvelope(other, env);
    expect(ok).toBe(false);
  });

  it('importPublicKey возвращает CryptoKey для verify', async () => {
    const { publicKey } = await generateIdentityKeyPair();
    const key = await importPublicKey(publicKey);
    expect(key.type).toBe('public');
    expect(key.usages).toContain('verify');
  });
});

describe('computePeerId', () => {
  it('детерминирован для одного и того же ключа', async () => {
    const pk = new Uint8Array(32);
    for (let i = 0; i < 32; i++) pk[i] = i;
    const a = await computePeerId(pk);
    const b = await computePeerId(pk);
    expect(a).toBe(b);
  });

  it('разные ключи → разные peerId', async () => {
    const pk1 = new Uint8Array(32).fill(1);
    const pk2 = new Uint8Array(32).fill(2);
    const a = await computePeerId(pk1);
    const b = await computePeerId(pk2);
    expect(a).not.toBe(b);
  });
});

describe('base58', () => {
  it('round-trip encode → decode', () => {
    const input = new Uint8Array([1, 2, 3, 4, 5, 255, 0, 128]);
    const encoded = base58Encode(input);
    const decoded = base58Decode(encoded);
    expect(Array.from(decoded)).toEqual(Array.from(input));
  });

  it('пустой массив кодируется в пустую строку', () => {
    expect(base58Encode(new Uint8Array(0))).toBe('');
  });

  it('ведущие нули сохраняются', () => {
    const input = new Uint8Array([0, 0, 5]);
    const decoded = base58Decode(base58Encode(input));
    expect(Array.from(decoded)).toEqual([0, 0, 5]);
  });

  it('кидает на недопустимом символе', () => {
    expect(() => base58Decode('0OIl')).toThrow();
  });
});
