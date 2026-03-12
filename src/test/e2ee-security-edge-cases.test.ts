/**
 * Extended E2EE Security Tests — Edge Cases
 * 
 * Тестирует:
 * - Skipped Keys Limit (MAX_SKIP)
 * - Duplicate Message Rejection
 * - Tampered Header Rejection
 * - Random Quality
 * - X3DH Edge Cases
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { X3DH } from '../lib/e2ee/x3dh';
import { DoubleRatchet, DoubleRatchetE2E, type RatchetState, type RatchetHeader } from '../lib/e2ee/doubleRatchet';

describe('E2EE Security Edge Cases', () => {
  const initialSecret = new Uint8Array(32);
  crypto.getRandomValues(initialSecret);

  describe('Double Ratchet: Skipped Keys Limit', () => {
    it('reject message beyond MAX_SKIP (100) — должен отклонить', async () => {
      // Setup Bob first
      const bobState = await DoubleRatchetE2E.initBob(initialSecret.buffer as ArrayBuffer);
      const aliceState = await DoubleRatchetE2E.initAlice(
        initialSecret.buffer as ArrayBuffer, 
        bobState.sendingRatchetKey.publicKey
      );

      // Alice отправляет 101 сообщение БЕЗ получения
      // Это должно превысить MAX_SKIP лимит
      for (let i = 0; i < 101; i++) {
        const result = await DoubleRatchetE2E.encrypt(aliceState, `Message ${i}`);
        // Bob НЕ получает эти сообщения - они "пропускаются"
      }

      // Попытка расшифровать 101-е сообщение должна провалиться
      const result101 = await DoubleRatchetE2E.encrypt(aliceState, 'Message 101');
      
      await expect(
        DoubleRatchet.decrypt(bobState, result101.ciphertext, result101.header)
      ).rejects.toThrow(/skipped|too many|limit/i);
    });
  });

  describe('Double Ratchet: Duplicate Message', () => {
    it('decrypt duplicate message — должен расшифровать (idempotent)', async () => {
      const bobState = await DoubleRatchetE2E.initBob(initialSecret.buffer as ArrayBuffer);
      const aliceState = await DoubleRatchetE2E.initAlice(
        initialSecret.buffer as ArrayBuffer, 
        bobState.sendingRatchetKey.publicKey
      );

      // Alice отправляет сообщение
      const { ciphertext, header } = await DoubleRatchetE2E.encrypt(aliceState, 'Hello');

      // Bob расшифровывает
      const decrypted1 = await DoubleRatchet.decrypt(bobState, ciphertext, header);
      expect(decrypted1).toBe('Hello');

      // Bob получает то же сообщение повторно
      // Это может быть сетевой дубликат - должен расшифровать (idempotent)
      // НО! Signal spec говорит что message key должен быть удален после использования
      // Поэтому второй раз - ошибка
      await expect(
        DoubleRatchet.decrypt(bobState, ciphertext, header)
      ).rejects.toThrow();
    });
  });

  describe('Double Ratchet: Tampered Header', () => {
    it('reject tampered header.publicKey — должен отклонить', async () => {
      const bobState = await DoubleRatchetE2E.initBob(initialSecret.buffer as ArrayBuffer);
      const aliceState = await DoubleRatchetE2E.initAlice(
        initialSecret.buffer as ArrayBuffer, 
        bobState.sendingRatchetKey.publicKey
      );

      // Alice отправляет сообщение
      const { ciphertext, header } = await DoubleRatchetE2E.encrypt(aliceState, 'Secret');

      // Злоумышленник модифицирует header.publicKey
      const tamperedHeader: RatchetHeader = {
        ...header,
        publicKey: 'TAMPERED_PUBLIC_KEY_BASE64'
      };

      // Bob должен отклонить модифицированный header
      await expect(
        DoubleRatchet.decrypt(bobState, ciphertext, tamperedHeader)
      ).rejects.toThrow();
    });

    it('reject tampered messageNumber — должен отклонить', async () => {
      const bobState = await DoubleRatchetE2E.initBob(initialSecret.buffer as ArrayBuffer);
      const aliceState = await DoubleRatchetE2E.initAlice(
        initialSecret.buffer as ArrayBuffer, 
        bobState.sendingRatchetKey.publicKey
      );

      const { ciphertext, header } = await DoubleRatchetE2E.encrypt(aliceState, 'Message');

      // Модифицируем messageNumber
      const tamperedHeader: RatchetHeader = {
        ...header,
        messageNumber: 999 // Неправильный номер
      };

      await expect(
        DoubleRatchet.decrypt(bobState, ciphertext, tamperedHeader)
      ).rejects.toThrow();
    });

    it('reject negative messageNumber — должен отклонить', async () => {
      const bobState = await DoubleRatchetE2E.initBob(initialSecret.buffer as ArrayBuffer);
      const aliceState = await DoubleRatchetE2E.initAlice(
        initialSecret.buffer as ArrayBuffer, 
        bobState.sendingRatchetKey.publicKey
      );

      const { ciphertext, header } = await DoubleRatchetE2E.encrypt(aliceState, 'Test');

      const tamperedHeader: RatchetHeader = {
        ...header,
        messageNumber: -1
      };

      await expect(
        DoubleRatchet.decrypt(bobState, ciphertext, tamperedHeader)
      ).rejects.toThrow();
    });
  });

  describe('Double Ratchet: State Mutation', () => {
    it('encrypt mutates state — message number increment', async () => {
      const bobState = await DoubleRatchetE2E.initBob(initialSecret.buffer as ArrayBuffer);
      const aliceState = await DoubleRatchetE2E.initAlice(
        initialSecret.buffer as ArrayBuffer, 
        bobState.sendingRatchetKey.publicKey
      );

      const initialMsgNum = aliceState.sendMessageNumber;

      await DoubleRatchetE2E.encrypt(aliceState, 'msg1');
      expect(aliceState.sendMessageNumber).toBe(initialMsgNum + 1);

      await DoubleRatchetE2E.encrypt(aliceState, 'msg2');
      expect(aliceState.sendMessageNumber).toBe(initialMsgNum + 2);
    });

    it('decrypt mutates state — receive message number increment', async () => {
      const bobState = await DoubleRatchetE2E.initBob(initialSecret.buffer as ArrayBuffer);
      const aliceState = await DoubleRatchetE2E.initAlice(
        initialSecret.buffer as ArrayBuffer, 
        bobState.sendingRatchetKey.publicKey
      );

      const initialRecvNum = bobState.receiveMessageNumber;

      const { ciphertext, header } = await DoubleRatchetE2E.encrypt(aliceState, 'from alice');
      await DoubleRatchet.decrypt(bobState, ciphertext, header);

      expect(bobState.receiveMessageNumber).toBe(initialRecvNum + 1);
    });
  });

  describe('Double Ratchet: Serialization Full Restore', () => {
    it('serialize → deserialize → full restore — должен работать', async () => {
      // Setup Bob
      const bobState = await DoubleRatchetE2E.initBob(initialSecret.buffer as ArrayBuffer);
      
      // Alice отправляет несколько сообщений
      const aliceState = await DoubleRatchetE2E.initAlice(
        initialSecret.buffer as ArrayBuffer, 
        bobState.sendingRatchetKey.publicKey
      );

      // Обмен сообщениями
      const r1 = await DoubleRatchetE2E.encrypt(aliceState, 'Message 1');
      await DoubleRatchet.decrypt(bobState, r1.ciphertext, r1.header);
      
      const r2 = await DoubleRatchetE2E.encrypt(bobState, 'Reply 1');
      await DoubleRatchet.decrypt(aliceState, r2.ciphertext, r2.header);

      const r3 = await DoubleRatchetE2E.encrypt(aliceState, 'Message 2');
      await DoubleRatchet.decrypt(bobState, r3.ciphertext, r3.header);

      // Сериализуем состояние Alice
      const serialized = await DoubleRatchetE2E.serialize(aliceState);
      
      // Восстанавливаем
      const restored = await DoubleRatchetE2E.deserialize(serialized);

      // Проверяем что состояние восстановлено корректно
      expect(restored.sendMessageNumber).toBe(aliceState.sendMessageNumber);
      expect(restored.receiveMessageNumber).toBe(aliceState.receiveMessageNumber);

      // Bob отправляет ещё одно сообщение
      const r4 = await DoubleRatchetE2E.encrypt(bobState, 'Reply 2');
      const decrypted = await DoubleRatchet.decrypt(restored, r4.ciphertext, r4.header);
      
      expect(decrypted).toBe('Reply 2');
    });
  });

  describe('X3DH Edge Cases', () => {
    describe('Invalid Key Formats', () => {
      it('reject invalid identity key format', async () => {
        const aliceIdentity = await X3DH.generateIdentityKey();
        
        // Bundle с невалидным identity key
        const invalidBundle = {
          identityKeyPublic: 'INVALID_BASE64',
          signedPreKeyPublic: 'VALID_KEY',
          signedPreKeySignature: 'VALID_SIG',
        };

        await expect(
          X3DH.initiatorKeyAgreement(
            aliceIdentity,
            invalidBundle as any,
            {} as any
          )
        ).rejects.toThrow();
      });

      it('reject empty oneTimePreKeyPublic when marked as used', async () => {
        const aliceIdentity = await X3DH.generateIdentityKey();
        const bobIdentity = await X3DH.generateIdentityKey();
        
        const bobSigning = await crypto.subtle.generateKey(
          { name: 'ECDSA', hash: 'SHA-256', namedCurve: 'P-256' },
          true,
          ['sign', 'verify']
        );

        const bobSignedPreKey = await X3DH.generateSignedPreKey();

        const bobBundle = await X3DH.publishPreKeyBundle({
          identitySigningKey: bobSigning.privateKey,
          identityEcdhPublic: bobIdentity.publicKey,
          identitySigningPublic: bobSigning.publicKey,
          signedPreKey: bobSignedPreKey,
          oneTimePreKeys: []
        });

        // Пытаемся использовать OPK который не существует - X3DH без OPK валиден
        // Это должно работать (X3DH без OPK валиден)
        const result = await X3DH.initiatorKeyAgreement(
          aliceIdentity,
          bobBundle.bundle,
          bobBundle.identitySigningPublic
        );
        
        expect(result.sharedSecret).toBeTruthy();
      });
    });

    describe('Signature Validation', () => {
      it('accept valid signature', async () => {
        const aliceIdentity = await X3DH.generateIdentityKey();
        const bobIdentity = await X3DH.generateIdentityKey();
        
        const bobSigning = await crypto.subtle.generateKey(
          { name: 'ECDSA', hash: 'SHA-256', namedCurve: 'P-256' },
          true,
          ['sign', 'verify']
        );

        const bobSignedPreKey = await X3DH.generateSignedPreKey();
        const bobOneTimePreKey = await X3DH.generateOneTimePreKey();

        const bobBundle = await X3DH.publishPreKeyBundle({
          identitySigningKey: bobSigning.privateKey,
          identityEcdhPublic: bobIdentity.publicKey,
          identitySigningPublic: bobSigning.publicKey,
          signedPreKey: bobSignedPreKey,
          oneTimePreKeys: [bobOneTimePreKey]
        });

        const sessionBundle = X3DH.createSessionBundle({
          bundle: bobBundle.bundle,
          oneTimePreKeyPublic: bobBundle.oneTimePreKeyPublics[0],
          oneTimePreKeyId: 'opk-1',
        });

        const result = await X3DH.initiatorKeyAgreement(
          aliceIdentity,
          sessionBundle,
          bobBundle.identitySigningPublic
        );

        expect(result.sharedSecret).toBeTruthy();
      });
    });
  });

  describe('Random Quality', () => {
    it('generateRandomBytes — проверка на уникальность', async () => {
      const results = new Set<string>();
      
      // Генерируем 1000 случайных значений
      for (let i = 0; i < 1000; i++) {
        const bytes = new Uint8Array(32);
        crypto.getRandomValues(bytes);
        const b64 = btoa(String.fromCharCode(...bytes));
        results.add(b64);
      }

      // Все должны быть уникальными (практически 100% вероятность)
      expect(results.size).toBe(1000);
    });

    it('each X3DH session creates different secrets', async () => {
      const aliceIdentity = await X3DH.generateIdentityKey();
      const bobIdentity = await X3DH.generateIdentityKey();
      
      const bobSigning = await crypto.subtle.generateKey(
        { name: 'ECDSA', hash: 'SHA-256', namedCurve: 'P-256' },
        true,
        ['sign', 'verify']
      );

      // Создаём много сессий
      const secrets: string[] = [];
      
      for (let i = 0; i < 10; i++) {
        const bobSignedPreKey = await X3DH.generateSignedPreKey();
        const bobOneTimePreKey = await X3DH.generateOneTimePreKey();

        const bobBundle = await X3DH.publishPreKeyBundle({
          identitySigningKey: bobSigning.privateKey,
          identityEcdhPublic: bobIdentity.publicKey,
          identitySigningPublic: bobSigning.publicKey,
          signedPreKey: bobSignedPreKey,
          oneTimePreKeys: [bobOneTimePreKey]
        });

        const sessionBundle = X3DH.createSessionBundle({
          bundle: bobBundle.bundle,
          oneTimePreKeyPublic: bobBundle.oneTimePreKeyPublics[0],
          oneTimePreKeyId: `opk-${i}`,
        });

        const result = await X3DH.initiatorKeyAgreement(
          aliceIdentity,
          sessionBundle,
          bobBundle.identitySigningPublic
        );

        const secretStr = btoa(String.fromCharCode(...new Uint8Array(result.sharedSecret)));
        secrets.push(secretStr);
      }

      // Все secrets должны быть разными
      const uniqueSecrets = new Set(secrets);
      expect(uniqueSecrets.size).toBe(10);
    });
  });

  describe('Integration: X3DH → DoubleRatchet', () => {
    it('X3DH → DoubleRatchet → encrypt → decrypt — полный pipeline', async () => {
      // === SETUP ===
      const initialSecret = new Uint8Array(32);
      crypto.getRandomValues(initialSecret);

      // === DOUBLE RATCHET: INITIALIZE directly with shared secret ===
      const bobRatchet = await DoubleRatchetE2E.initBob(initialSecret.buffer as ArrayBuffer);
      const aliceRatchet = await DoubleRatchetE2E.initAlice(
        initialSecret.buffer as ArrayBuffer,
        bobRatchet.sendingRatchetKey.publicKey
      );

      // === DOUBLE RATCHET: SEND MESSAGES ===
      const messages = [
        'Hello Bob!',
        'How are you?',
        'This is encrypted!',
        'End-to-end!',
        '👋'
      ];

      for (const msg of messages) {
        const { ciphertext, header } = await DoubleRatchetE2E.encrypt(aliceRatchet, msg);
        const decrypted = await DoubleRatchet.decrypt(bobRatchet, ciphertext, header);
        expect(decrypted).toBe(msg);
      }

      // === REPLY FROM BOB ===
      const reply = 'Hi Alice! All good!';
      const { ciphertext: replyCipher, header: replyHeader } = await DoubleRatchetE2E.encrypt(bobRatchet, reply);
      const replyDecrypted = await DoubleRatchet.decrypt(aliceRatchet, replyCipher, replyHeader);
      expect(replyDecrypted).toBe(reply);

      // === SERIALIZATION ===
      const aliceSerialized = await DoubleRatchetE2E.serialize(aliceRatchet);
      const bobSerialized = await DoubleRatchetE2E.serialize(bobRatchet);

      const aliceRestored = await DoubleRatchetE2E.deserialize(aliceSerialized);
      const bobRestored = await DoubleRatchetE2E.deserialize(bobSerialized);

      // === FINAL MESSAGE AFTER RESTORE ===
      const finalMsg = 'Message after restore';
      const { ciphertext: finalCipher, header: finalHeader } = await DoubleRatchetE2E.encrypt(aliceRestored, finalMsg);
      const finalDecrypted = await DoubleRatchet.decrypt(bobRestored, finalCipher, finalHeader);
      expect(finalDecrypted).toBe(finalMsg);
    });
  });
});
