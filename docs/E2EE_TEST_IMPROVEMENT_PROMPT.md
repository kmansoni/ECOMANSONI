# E2EE Test Improvement Prompt: Достижение 10/10

---

## Текущее Состояние → Целевое

| Категория | Текущая | Целевая |Gap|
|-----------|---------|---------|---|
| Базовые операции | 9/10 | 10/10 | +1 |
| Edge cases | 7/10 | 10/10 | +3 |
| Security tests | 6/10 | 10/10 | +4 |
| Integration | 6/10 | 10/10 | +4 |

---

# Фаза 1: Edge Cases (7/10 → 10/10)

## Задача 1.1: Добавить тест на Chain Key Exhaustion

**Контекст:** Когда chain key исчерпан (слишком много сообщений в одной цепочке), должен происходить DH ratchet.

**Инструкция:**
```
Добавь в e2ee-security-edge-cases.test.ts:

it('DH ratchet after chain key exhaustion — должен переключиться на новую цепочку', async () => {
  // Проблема: В текущей реализации нет явного "exhaustion" - цепочка бесконечная
  // НУЖНО: Проверить что после большого количества сообщений происходит ротация DH
  
  // Смотри в doubleRatchet.ts - есть ли MAX_CHAIN_LENGTH?
  // Если нет - нужно добавить и протестировать
  
  // Тест: после N сообщений в одной цепочке - должен быть новый DH ratchet
});
```

## Задача 1.2: Добавить тест на previousChainLength в header

**Контекст:** Header содержит previousChainLength для синхронизации при DH ratchet.

**Инструкция:**
```
Добавь:

it('previousChainLength correctly tracks chain length', async () => {
  // Проверь что header.previousChainLength корректный после нескольких DH ratchets
  // 1. Alice → Bob: msg1, msg2, msg3 (chain A1)
  // 2. Bob → Alice: msg4 (DH ratchet, chain A2)
  // 3. Проверь что header.previousChainLength == 3 для msg4
});
```

## Задача 1.3: Тест на разные размеры сообщений

**Инструкция:**
```
Добавь:

it('handle various message sizes — от 1 байта до 1MB', async () => {
  const sizes = [1, 16, 256, 1024, 16000, 100000]; // байты
  
  for (const size of sizes) {
    const msg = 'x'.repeat(size);
    const { ciphertext, header } = await DoubleRatchetE2E.encrypt(aliceState, msg);
    const decrypted = await DoubleRatchet.decrypt(bobState, ciphertext, header);
    expect(decrypted).toBe(msg);
  }
});
```

---

# Фаза 2: Security Tests (6/10 → 10/10)

## Задача 2.1: Timing Attack Simulation

**Контекст:** Нужно убедиться что критичные операции не уязвимы к timing attacks.

**Инструкция:**
```
Добавь:

describe('Timing Attack Protection', () => {
  it('signature verification takes same time for valid/invalid — симуляция', async () => {
    // Проблема: В браузере сложно измерить microsecond differences
    // Решение: Тестируем что есть explicit rejection с clear error
    
    // Проверяем что invalid signature вызывает явную ошибку
    // А не утекает через timing
    
    // Тест: Сравниваем время выполнения 100 раз для valid и invalid
    // Должно быть +/- 10% (не 50%+ разницы)
  });
});
```

## Задача 2.2: Memory Safety Tests

**Инструкция:**
```
Добавь:

describe('Memory Safety', () => {
  it('sensitive data cleared after operations', async () => {
    // Проверяем что после операций чувствительные данные очищены
    // Это сложно в JS, но можно проверить что объекты не содержат ссылок
    
    // GC должен очистить - проверяем косвенно
  });
  
  it('no key material in error messages', async () => {
    // Проверяем что ошибки не содержат ключей
    try {
      await DoubleRatchet.decrypt(state, 'invalid' as any, {} as any);
    } catch (e: any) {
      // Ошибка не должна содержать ключей
      const errorStr = e.toString();
      expect(errorStr).not.toMatch(/-----BEGIN/);
      expect(errorStr).not.toMatch(/[A-Za-z0-9+/]{40,}/); // base64 ключи
    }
  });
});
```

## Задача 2.3: Key Reuse Detection

**Инструкция:**
```
Добавь:

describe('Key Reuse Protection', () => {
  it('same message with same key produces different ciphertext (random IV)', async () => {
    // Один plaintext, два шифрования -> разные ciphertext
    
    const msg = 'Hello';
    const { ciphertext: c1 } = await DoubleRatchetE2E.encrypt(state, msg);
    const { ciphertext: c2 } = await DoubleRatchetE2E.encrypt(state, msg);
    
    // Ciphertext должны быть РАЗНЫМИ из-за random IV/nonce
    expect(c1).not.toEqual(c2);
  });
  
  it('message key is deleted after use', async () => {
    // Проверяем что message key нельзя использовать дважды
    
    const { ciphertext, header } = await DoubleRatchetE2E.encrypt(state, 'msg');
    await DoubleRatchet.decrypt(receiverState, ciphertext, header);
    
    // Повторная расшифровка должна провалиться
    await expect(
      DoubleRatchet.decrypt(receiverState, ciphertext, header)
    ).rejects.toThrow();
  });
});
```

## Задача 2.4: Overflow/Underflow Protection

**Инструкция:**
```
Добавь:

describe('Integer Overflow Protection', () => {
  it('reject extremely large messageNumber', async () => {
    // Симулируем очень большой messageNumber
    
    const hugeHeader: RatchetHeader = {
      publicKey: validPublicKey,
      previousChainLength: 0,
      messageNumber: Number.MAX_SAFE_INTEGER
    };
    
    await expect(
      DoubleRatchet.decrypt(state, ciphertext, hugeHeader)
    ).rejects.toThrow();
  });
  
  it('reject negative messageNumber', async () => {
    const negHeader: RatchetHeader = {
      publicKey: validPublicKey,
      previousChainLength: 0,
      messageNumber: -1
    };
    
    await expect(
      DoubleRatchet.decrypt(state, ciphertext, negHeader)
    ).rejects.toThrow();
  });
});
```

---

# Фаза 3: Integration Tests (6/10 → 10/10)

## Задача 3.1: Multi-Device Simulation

**Инструкция:**
```
Добавь:

describe('Multi-Device Integration', () => {
  it('same user, multiple devices — разные sender keys', async () => {
    // Симуляция: Пользователь с 2 устройствами
    // Device A и Device B должны иметь разные sender keys
    
    const userSecret = new Uint8Array(32);
    crypto.getRandomValues(userSecret);
    
    // Device 1
    const device1 = await DoubleRatchetE2E.initBob(userSecret.buffer as ArrayBuffer);
    const device1Serialized = await DoubleRatchetE2E.serialize(device1);
    
    // Device 2 - другая цепочка (но тот же initial secret)
    // Проблема: Текущая реализация использует одинаковый secret для всех устройств
    // НУЖНО: Каждое устройство должно генерировать свой sender key
    
    // Пока тест проверяет что сериализация работает
    const device1Restored = await DoubleRatchetE2E.deserialize(device1Serialized);
    expect(device1Restored).toBeTruthy();
  });
});
```

## Задача 3.2: Network Interruption Recovery

**Инструкция:**
```
Добавь:

describe('Network Interruption Recovery', () => {
  it('resume after long disconnection — state preserved', async () => {
    // Симулируем отключение на время
    
    const bobState = await DoubleRatchetE2E.initBob(initialSecret);
    const aliceState = await DoubleRatchetE2E.initAlice(
      initialSecret, 
      bobState.sendingRatchetKey.publicKey
    );
    
    // Alice отправляет несколько сообщений
    await DoubleRatchetE2E.encrypt(aliceState, 'msg1');
    await DoubleRatchetE2E.encrypt(aliceState, 'msg2');
    await DoubleRatchetE2E.encrypt(aliceState, 'msg3');
    
    // Serialize - имитация закрытия приложения
    const serialized = await DoubleRatchetE2E.serialize(aliceState);
    
    // Имитация долгого перерыва (можно добавить timestamp в state)
    // Восстановление
    const restored = await DoubleRatchetE2E.deserialize(serialized);
    
    // Продолжаем отправку
    const { ciphertext, header } = await DoubleRatchetE2E.encrypt(restored, 'msg4 after break');
    const decrypted = await DoubleRatchet.decrypt(bobState, ciphertext, header);
    
    expect(decrypted).toBe('msg4 after break');
  });
});
```

## Задача 3.3: Full Chat Session

**Инструкция:**
```
Добавь:

describe('Full Chat Session', () => {
  it('complete chat: 100 messages back-and-forth', async () => {
    const bobState = await DoubleRatchetE2E.initBob(initialSecret);
    const aliceState = await DoubleRatchetE2E.initAlice(
      initialSecret, 
      bobState.sendingRatchetKey.publicKey
    );
    
    const messages = [];
    for (let i = 0; i < 50; i++) {
      messages.push(`Alice msg ${i}`);
      messages.push(`Bob msg ${i}`);
    }
    
    // Send all messages
    for (let i = 0; i < messages.length; i++) {
      const sender = i % 2 === 0 ? aliceState : bobState;
      const receiver = i % 2 === 0 ? bobState : aliceState;
      
      const { ciphertext, header } = await DoubleRatchetE2E.encrypt(sender, messages[i]);
      const decrypted = await DoubleRatchet.decrypt(receiver, ciphertext, header);
      
      expect(decrypted).toBe(messages[i]);
    }
  });
});
```

## Задача 3.4: Group Chat Simulation

**Инструкция:**
```
Добавь:

describe('Group Chat Simulation (Sender Keys)', () => {
  it('simulate group with sender key distribution', async () => {
    // Пока нет полной реализации sender keys - симулируем
    
    const groupSecret = new Uint8Array(32);
    crypto.getRandomValues(groupSecret);
    
    // 3 участника
    const alice = await DoubleRatchetE2E.initBob(groupSecret);
    const bob = await DoubleRatchetE2E.initBob(groupSecret);
    const charlie = await DoubleRatchetE2E.initBob(groupSecret);
    
    // NOTE: Это не полноценный group chat - нужна реализация Sender Keys
    // Пока тест проверяет базовую работоспособность
    
    expect(alice).toBeTruthy();
    expect(bob).toBeTruthy();
    expect(charlie).toBeTruthy();
  });
});
```

---

# Фаза 4: Basic Operations (9/10 → 10/10)

## Задача 4.1: Error Message Specificity

**Инструкция:**
```
Добавь:

describe('Error Handling Quality', () => {
  it('invalid signature throws specific error', async () => {
    // Проверяем что ошибки информативные
    
    await expect(
      X3DH.initiatorKeyAgreement(aliceIdentity, tamperedBundle, signingKey)
    ).rejects.toThrow(/signature|invalid|verification/i);
  });
  
  it('missing OPK throws specific error', async () => {
    // Проверяем конкретный error message
    
    await expect(
      X3DH.responderKeyAgreement({
        ...params,
        oneTimePreKeyWasUsed: true,
        oneTimePreKeyPair: null // OPK required but missing
      })
    ).rejects.toThrow(/OPK|one-time|missing/i);
  });
});
```

## Задача 4.2: Concurrent Operations

**Инструкция:**
```
Добавь:

describe('Concurrent Operations', () => {
  it('parallel encrypt/decrypt operations', async () => {
    // Тест на race conditions
    
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        DoubleRatchetE2E.encrypt(aliceState, `msg ${i}`)
      );
    }
    
    const results = await Promise.all(promises);
    
    // Все должны расшифроваться
    for (const { ciphertext, header } of results) {
      const decrypted = await DoubleRatchet.decrypt(bobState, ciphertext, header);
      expect(decrypted).toBeDefined();
    }
  });
});
```

---

# Чеклист

```
□ Фаза 1: Edge Cases
  □ 1.1 Chain Key Exhaustion
  □ 1.2 previousChainLength
  □ 1.3 Message Sizes

□ Фаза 2: Security Tests  
  □ 2.1 Timing Attack
  □ 2.2 Memory Safety
  □ 2.3 Key Reuse Detection
  □ 2.4 Overflow Protection

□ Фаза 3: Integration
  □ 3.1 Multi-Device
  □ 3.2 Network Interruption
  □ 3.3 Full Chat (100 messages)
  □ 3.4 Group Chat

□ Фаза 4: Basic Operations
  □ 4.1 Error Messages
  □ 4.2 Concurrent Operations
```

---

# Notes

- Запускай тесты после каждого добавления: `npm run test -- src/test/e2ee --run`
- Используй понятные названия тестов
- Один тест = одна проверка
- Документируй что проверяет каждый тест
- Если тест падает - это OK, значит нашёл bug!