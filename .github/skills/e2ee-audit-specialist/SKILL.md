---
name: e2ee-audit-specialist
description: "Аудит E2EE реализации: ключевая инфраструктура, Double Ratchet, обмен ключами, forward secrecy, key verification, атаки на мессенджеры. Use when: E2EE аудит, шифрование сообщений, ключи, MessageKeyBundle, forward secrecy, проверить безопасность E2EE."
argument-hint: "[аудит: key-exchange | message-encryption | key-storage | all]"
---

# E2EE Audit Specialist — Аудит шифрования

---

## Архитектура E2EE проекта

```
src/lib/e2ee/          — E2EE библиотека
  keys.ts              — Генерация и управление ключами
  encryption.ts        — Шифрование/дешифрование сообщений
  key-exchange.ts      — X3DH протокол обмена ключами

Таблицы БД:
  user_key_bundles     — Публичные ключи пользователей (X3DH prekeys)
  message_keys         — Зашифрованные ключи сообщений
  e2ee_sessions        — Сессионные ключи (Double Ratchet state)
```

---

## Аудит: генерация ключей

```typescript
// ✅ Правильно: Web Crypto API (встроен в браузер)
async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },  // Или X25519
    true,   // extractable для экспорта публичного ключа
    ['deriveKey', 'deriveBits']
  );
}

// ✅ Правильно: случайные bytes через crypto
const nonce = crypto.getRandomValues(new Uint8Array(12));

// ❌ КРИТИЧЕСКИ: Math.random() для крипто
const badNonce = Math.random(); // НЕ использовать!

// ❌ КРИТИЧЕСКИ: Хранение приватного ключа в localStorage как строки
localStorage.setItem('privateKey', JSON.stringify(privateKey)); // ОПАСНО!

// ✅ Правильно: IndexedDB или Supabase Vault (не extractable)
const nonExtractableKey = await crypto.subtle.generateKey(
  { name: 'AES-GCM', length: 256 },
  false,  // НЕ extractable — ключ нельзя вытащить из браузера
  ['encrypt', 'decrypt']
);
```

---

## Аудит: шифрование сообщений

```typescript
// Проверить: каждое сообщение с уникальным nonce?
async function encryptMessage(content: string, key: CryptoKey): Promise<{ ciphertext: ArrayBuffer; nonce: Uint8Array }> {
  const nonce = crypto.getRandomValues(new Uint8Array(12)); // 96 бит для GCM
  const encoded = new TextEncoder().encode(content);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 },
    key,
    encoded
  );

  return { ciphertext, nonce };
}

// ✅ AES-GCM с authentication tag — обнаруживает подделку
// ❌ AES-ECB — НЕ использовать (детерминированный)
// ❌ AES-CBC без HMAC — НЕ использовать (padding oracle)
```

---

## Аудит: обмен ключами (X3DH)

```typescript
// Чеклист для X3DH протокола
// 1. Ключевой пакет (KeyBundle) содержит:
//    - Identity Key (IK) — долгосрочный
//    - Signed PreKey (SPK) — ротируется каждые ~30 дней
//    - One-Time PreKeys (OPK) — используются однократно
// 2. SPK должен быть подписан IK (проверить!)
// 3. OPK удаляются из БД после использования

// Проверить: есть ли достаточно OPK?
const { count } = await supabase
  .from('user_one_time_prekeys')
  .select('*', { count: 'exact', head: true })
  .eq('user_id', userId)
  .is('used_at', null);

if (count < 10) {
  // Сгенерировать новые OPK и загрузить на сервер
  await replenishOneTimePrekeys(userId);
}
```

---

## Аудит: forward secrecy

```
Forward Secrecy = компрометация одного ключа не раскрывает прошлые сообщения

Проверять:
✅ Используется ли Double Ratchet для каждого сообщения?
✅ Старые ключи удаляются после использования?
✅ SPK ротируется регулярно (не фиксированный)?
✅ OPK используется однократно?

Признаки НАРУШЕНИЯ forward secrecy:
❌ Все сообщения зашифрованы одним статическим ключом
❌ Ключи хранятся в localStorage вечно
❌ OPK не удаляется после первого использования
❌ nonce повторяется (IV reuse с AES-GCM → catastrophic failure)
```

---

## Grep паттерны для аудита

```bash
# Поиск потенциальных проблем:
grep -r "Math.random" src/lib/e2ee/    # Криптографически ненадёжный!
grep -r "localStorage" src/lib/e2ee/   # Небезопасное хранение?
grep -r "AES-ECB\|AES-CBC" src/lib/   # Слабые режимы?
grep -r "nonce\|iv" src/lib/e2ee/     # Проверить генерацию
grep -r "extractable: true" src/lib/  # Только для публичных ключей
```

---

## Чеклист

- [ ] Web Crypto API (не сторонние библиотеки без аудита)
- [ ] `crypto.getRandomValues()` для всех nonce/IV (не Math.random!)
- [ ] AES-GCM с уникальным 96-бит nonce на каждое сообщение
- [ ] Приватные ключи: non-extractable или зашифрованы перед экспортом
- [ ] OPK используется однократно и удаляется из таблицы
- [ ] SPK ротируется (не статический навсегда)
- [ ] IV/nonce НИКОГДА не повторяется (сохранять счётчик)
- [ ] Верификация подписи SPK перед началом сессии
