/**
 * Unit тесты для CallKeyExchange — ECDH key exchange для E2EE call sessions.
 *
 * Обновлено после security fixes:
 * - H-2: rawKeyBytes удалён из EpochKeyMaterial — тесты используют CryptoKey напрямую
 * - C-1: processKeyPackage требует registerPeerSigningKey() перед вызовом
 * - H-1: KeyPackageData теперь содержит salt (random)
 * - H-4: getPeerPublicKeyBase64 принимает composite "userId:deviceId" ключ
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CallKeyExchange } from '../calls-v2/callKeyExchange';

const aliceIdentity = { userId: 'alice', deviceId: 'd1', sessionId: 's1' };
const bobIdentity   = { userId: 'bob',   deviceId: 'd2', sessionId: 's2' };

/**
 * Helper: настроить взаимный обмен signing keys для участников.
 * В реальном коде это происходит через E2EE handshake при PEER_JOINED.
 */
async function exchangeSigningKeys(a: CallKeyExchange, b: CallKeyExchange, aId: typeof aliceIdentity, bId: typeof bobIdentity) {
  const aPubSign = await a.getSigningPublicKeyBase64();
  const bPubSign = await b.getSigningPublicKeyBase64();
  await b.registerPeerSigningKey(`${aId.userId}:${aId.deviceId}`, aPubSign);
  await a.registerPeerSigningKey(`${bId.userId}:${bId.deviceId}`, bPubSign);
}

describe('CallKeyExchange', () => {
  let alice: CallKeyExchange;
  let bob: CallKeyExchange;

  beforeEach(() => {
    alice = new CallKeyExchange(aliceIdentity);
    bob   = new CallKeyExchange(bobIdentity);
  });

  it('initialize() — генерирует ECDH + ECDSA key pairs', async () => {
    await alice.initialize();
    // После initialize() getPublicKeyBase64 должна работать без ошибок
    const pub = await alice.getPublicKeyBase64();
    expect(pub).toBeTruthy();
  });

  it('getPublicKeyBase64() — возвращает валидный base64 P-256 public key (65 bytes uncompressed)', async () => {
    await alice.initialize();
    const pub = await alice.getPublicKeyBase64();
    const raw = Uint8Array.from(atob(pub), c => c.charCodeAt(0));
    expect(raw.length).toBe(65);
    // Uncompressed P-256 начинается с 0x04
    expect(raw[0]).toBe(0x04);
  });

  it('getPublicKeyBase64() throws before initialize()', async () => {
    await expect(alice.getPublicKeyBase64()).rejects.toThrow('Not initialized');
  });

  it('getSigningPublicKeyBase64() — возвращает валидный ECDSA signing public key', async () => {
    await alice.initialize();
    const sigPub = await alice.getSigningPublicKeyBase64();
    const raw = Uint8Array.from(atob(sigPub), c => c.charCodeAt(0));
    expect(raw.length).toBe(65); // P-256 uncompressed
    expect(raw[0]).toBe(0x04);
  });

  it('createEpochKey(epoch) — создаёт AES-128-GCM key с правильным epoch (H-2: без rawKeyBytes)', async () => {
    await alice.initialize();
    const epochKey = await alice.createEpochKey(1);
    expect(epochKey.epoch).toBe(1);
    expect(epochKey.key).toBeTruthy();
    // H-2: rawKeyBytes НЕ должен присутствовать
    expect((epochKey as any).rawKeyBytes).toBeUndefined();
    expect(epochKey.key.type).toBe('secret');
    expect(epochKey.key.extractable).toBe(false); // non-extractable
  });

  it('createKeyPackage + processKeyPackage roundtrip — Bob получает epoch key с тем же epoch (C-1, H-1)', async () => {
    await alice.initialize();
    await bob.initialize();

    // C-1: обменяться signing keys перед processKeyPackage
    await exchangeSigningKeys(alice, bob, aliceIdentity, bobIdentity);

    const epoch = 1;
    await alice.createEpochKey(epoch);

    const bobPub = await bob.getPublicKeyBase64();
    const pkg = await alice.createKeyPackage(bobPub, epoch);

    // H-1: pkg должен содержать salt
    expect(pkg.salt).toBeTruthy();
    const saltBytes = Uint8Array.from(atob(pkg.salt), c => c.charCodeAt(0));
    expect(saltBytes.length).toBe(32);

    const recovered = await bob.processKeyPackage(pkg);

    expect(recovered.epoch).toBe(epoch);
    // H-2: нет rawKeyBytes — проверяем что key - это CryptoKey
    expect(recovered.key).toBeTruthy();
    expect(recovered.key.type).toBe('secret');
    expect(recovered.key.extractable).toBe(false);
  });

  it('Epoch key rotation — createEpochKey(2) после createEpochKey(1), оба доступны', async () => {
    await alice.initialize();
    const e1 = await alice.createEpochKey(1);
    const e2 = await alice.createEpochKey(2);

    expect(alice.getCurrentEpochKey()!.epoch).toBe(2);
    expect(alice.getEpochKey(1)).toBeTruthy();
    expect(alice.getEpochKey(2)).toBeTruthy();
    // H-2: ключи разные — проверяем что это разные CryptoKey объекты
    expect(e1.key).not.toBe(e2.key);
  });

  it('destroy() — очищает все ключи, getPublicKeyBase64() throws', async () => {
    await alice.initialize();
    await alice.createEpochKey(1);
    alice.destroy();

    await expect(alice.getPublicKeyBase64()).rejects.toThrow();
    expect(alice.getCurrentEpochKey()).toBeNull();
    expect(alice.getEpochKey(1)).toBeNull();
  });

  it('Identity binding — key package содержит senderIdentity и salt', async () => {
    await alice.initialize();
    await bob.initialize();
    await alice.createEpochKey(1);
    const pkg = await alice.createKeyPackage(await bob.getPublicKeyBase64(), 1);

    expect(pkg.senderIdentity.userId).toBe(aliceIdentity.userId);
    expect(pkg.senderIdentity.deviceId).toBe(aliceIdentity.deviceId);
    expect(pkg.senderIdentity.sessionId).toBe(aliceIdentity.sessionId);
    // H-1: salt присутствует
    expect(pkg.salt).toBeTruthy();
  });

  it('Разные epoch keys для разных epochs — разные CryptoKey объекты (H-2)', async () => {
    await alice.initialize();
    const e1 = await alice.createEpochKey(1);
    const e2 = await alice.createEpochKey(2);
    // Разные объекты CryptoKey — не могут быть одинаковым ключом
    expect(e1.key).not.toBe(e2.key);
  });

  it('C-1: processKeyPackage без registerPeerSigningKey → throws', async () => {
    await alice.initialize();
    await bob.initialize();
    await alice.createEpochKey(1);

    const bobPub = await bob.getPublicKeyBase64();
    const pkg = await alice.createKeyPackage(bobPub, 1);

    // Bob не зарегистрировал signing key Alice → должен бросить
    await expect(bob.processKeyPackage(pkg)).rejects.toThrow('no signing key registered');
  });

  it('C-5: processKeyPackage с epoch rollback → throws', async () => {
    await alice.initialize();
    await bob.initialize();
    await exchangeSigningKeys(alice, bob, aliceIdentity, bobIdentity);

    // Bob принимает epoch 2
    await alice.createEpochKey(2);
    const bobPub = await bob.getPublicKeyBase64();
    const pkg2 = await alice.createKeyPackage(bobPub, 2);
    await bob.processKeyPackage(pkg2);

    // Теперь Alice пытается отправить epoch 1 (rollback)
    await alice.createEpochKey(1);
    const pkg1 = await alice.createKeyPackage(bobPub, 1);
    await expect(bob.processKeyPackage(pkg1)).rejects.toThrow('Epoch rollback REJECTED');
  });

  it('processKeyPackage с неправильным public key → throws', async () => {
    await alice.initialize();
    await bob.initialize();

    // C-1: регистрируем signing keys
    const aliceSigPub = await alice.getSigningPublicKeyBase64();
    const charlieSigPub = await (async () => {
      const charlie = new CallKeyExchange({ userId: 'charlie', deviceId: 'd3', sessionId: 's3' });
      await charlie.initialize();
      return charlie.getSigningPublicKeyBase64();
    })();

    // Bob регистрирует signing key Alice (не Charlie)
    await bob.registerPeerSigningKey(`${aliceIdentity.userId}:${aliceIdentity.deviceId}`, aliceSigPub);

    await alice.createEpochKey(1);

    // Создаём третий участник с другим ключём
    const charlie = new CallKeyExchange({ userId: 'charlie', deviceId: 'd3', sessionId: 's3' });
    await charlie.initialize();
    const charliePub = await charlie.getPublicKeyBase64();

    // Alice создаёт пакет для Charlie (не для Bob)
    const pkg = await alice.createKeyPackage(charliePub, 1);

    // Bob пытается обработать пакет зашифрованный для Charlie → должна быть ошибка
    await expect(bob.processKeyPackage(pkg)).rejects.toThrow();
  });
});
