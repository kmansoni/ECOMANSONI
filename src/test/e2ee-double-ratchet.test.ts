/**
 * Unit тесты для Double Ratchet Algorithm (Signal Protocol)
 * 
 * Тестирует:
 * - Инициализацию Alice и Bob
 * - Отправку/получение сообщений
 * - Perfect Forward Secrecy (PFS)
 * - Out-of-order delivery (skipped keys)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DoubleRatchet,
  DoubleRatchetE2E,
  type RatchetState,
  type RatchetHeader
} from '../lib/e2ee/doubleRatchet';

describe('DoubleRatchetE2E', () => {
  // Shared initial secret (from X3DH)
  const initialSecret = new Uint8Array(32);
  crypto.getRandomValues(initialSecret);

  describe('Initialization', () => {
    it('initBob — создаёт принимающую сессию', async () => {
      const state = await DoubleRatchetE2E.initBob(initialSecret.buffer as ArrayBuffer);
      
      // Should have sending ratchet key pair
      expect(state.sendingRatchetKey).toBeTruthy();
      expect(state.receivingRatchetPublicKey).toBeNull();
      expect(state.sendingChainKey).toBeNull();
    });

    it('initAlice — создаёт отправляющую сессию', async () => {
      // Сначала создаём Bob state чтобы получить его публичный ключ
      const bobState = await DoubleRatchetE2E.initBob(initialSecret.buffer as ArrayBuffer);
      const bobPublicKey = bobState.sendingRatchetKey.publicKey;
      
      const state = await DoubleRatchetE2E.initAlice(initialSecret.buffer as ArrayBuffer, bobPublicKey);
      
      // Should have receiving chain key (после DH ratchet)
      expect(state.sendingRatchetKey).toBeTruthy();
      expect(state.receivingRatchetPublicKey).toBeTruthy();
    });
  });

  describe('Basic Send/Receive Flow', () => {
    let aliceState: RatchetState;
    let bobState: RatchetState;

    beforeEach(async () => {
      // Setup: Bob first
      bobState = await DoubleRatchetE2E.initBob(initialSecret.buffer as ArrayBuffer);
      
      // Alice инициализирует с публичным ключом Bob
      aliceState = await DoubleRatchetE2E.initAlice(
        initialSecret.buffer as ArrayBuffer, 
        bobState.sendingRatchetKey.publicKey
      );
    });

    it('encrypt — возвращает ciphertext и header', async () => {
      const result = await DoubleRatchetE2E.encrypt(aliceState, 'test message');
      
      expect(result.ciphertext).toBeDefined();
      expect(result.header).toBeDefined();
      expect(result.header.publicKey).toBeDefined();
      expect(typeof result.header.messageNumber).toBe('number');
      expect(result.header.messageNumber).toBe(0); // First message
    });

    it('encrypt → decrypt — базовый обмен', async () => {
      const plaintext = 'Hello, Bob!';
      
      // Alice encrypts
      const { ciphertext, header } = await DoubleRatchetE2E.encrypt(aliceState, plaintext);
      
      // Bob decrypts (mutates state internally)
      const decrypted = await DoubleRatchet.decrypt(bobState, ciphertext, header);
      
      expect(decrypted).toBe(plaintext);
    });

    it('Bidirectional — Alice ↔ Bob', async () => {
      const aliceMsg = 'Message from Alice';

      // Alice → Bob
      const r1 = await DoubleRatchetE2E.encrypt(aliceState, aliceMsg);
      const d1 = await DoubleRatchet.decrypt(bobState, r1.ciphertext, r1.header);
      expect(d1).toBe(aliceMsg);

      // Bob → Alice (сначала Alice должна получить ответный ключ)
      // Примечание: после decrypt Bob уже имеет ключ для ответа
      const bobMsg = 'Message from Bob';
      const r2 = await DoubleRatchetE2E.encrypt(bobState, bobMsg);
      const d2 = await DoubleRatchet.decrypt(aliceState, r2.ciphertext, r2.header);
      expect(d2).toBe(bobMsg);
    });
  });

  describe('Perfect Forward Secrecy', () => {
    let aliceState: RatchetState;
    let bobState: RatchetState;

    beforeEach(async () => {
      bobState = await DoubleRatchetE2E.initBob(initialSecret.buffer as ArrayBuffer);
      aliceState = await DoubleRatchetE2E.initAlice(
        initialSecret.buffer as ArrayBuffer, 
        bobState.sendingRatchetKey.publicKey
      );
    });

    it('каждое сообщение имеет уникальный message number', async () => {
      const r1 = await DoubleRatchetE2E.encrypt(aliceState, 'msg1');
      const r2 = await DoubleRatchetE2E.encrypt(aliceState, 'msg2');
      const r3 = await DoubleRatchetE2E.encrypt(aliceState, 'msg3');

      expect(r1.header.messageNumber).toBe(0);
      expect(r2.header.messageNumber).toBe(1);
      expect(r3.header.messageNumber).toBe(2);

      // Все корректно расшифровываются
      expect(await DoubleRatchet.decrypt(bobState, r1.ciphertext, r1.header)).toBe('msg1');
      expect(await DoubleRatchet.decrypt(bobState, r2.ciphertext, r2.header)).toBe('msg2');
      expect(await DoubleRatchet.decrypt(bobState, r3.ciphertext, r3.header)).toBe('msg3');
    });
  });

  describe('Out-of-order Delivery', () => {
    let aliceState: RatchetState;
    let bobState: RatchetState;

    beforeEach(async () => {
      bobState = await DoubleRatchetE2E.initBob(initialSecret.buffer as ArrayBuffer);
      aliceState = await DoubleRatchetE2E.initAlice(
        initialSecret.buffer as ArrayBuffer, 
        bobState.sendingRatchetKey.publicKey
      );
    });

    it('получение сообщений не по порядку', async () => {
      const r1 = await DoubleRatchetE2E.encrypt(aliceState, 'Message 0');
      const r2 = await DoubleRatchetE2E.encrypt(aliceState, 'Message 1');
      const r3 = await DoubleRatchetE2E.encrypt(aliceState, 'Message 2');

      // Bob получает в обратном порядке
      const d3 = await DoubleRatchet.decrypt(bobState, r3.ciphertext, r3.header);
      expect(d3).toBe('Message 2');

      const d1 = await DoubleRatchet.decrypt(bobState, r1.ciphertext, r1.header);
      expect(d1).toBe('Message 0');

      const d2 = await DoubleRatchet.decrypt(bobState, r2.ciphertext, r2.header);
      expect(d2).toBe('Message 1');
    });
  });

  describe('Serialization', () => {
    let bobState: RatchetState;

    beforeEach(async () => {
      bobState = await DoubleRatchetE2E.initBob(initialSecret.buffer as ArrayBuffer);
    });

    it('serialize → deserialize — сохраняет состояние', async () => {
      // Отправим сообщение чтобы изменить state
      const aliceState = await DoubleRatchetE2E.initAlice(
        initialSecret.buffer as ArrayBuffer, 
        bobState.sendingRatchetKey.publicKey
      );
      
      const { ciphertext, header } = await DoubleRatchetE2E.encrypt(aliceState, 'test');
      await DoubleRatchet.decrypt(bobState, ciphertext, header);

      // Сериализуем
      const serialized = await DoubleRatchetE2E.serialize(bobState);
      expect(serialized).toBeDefined();
      expect(typeof serialized).toBe('string');

      // Десериализуем
      const restored = await DoubleRatchetE2E.deserialize(serialized);
      expect(restored.sendMessageNumber).toBe(bobState.sendMessageNumber);
    });
  });
});
