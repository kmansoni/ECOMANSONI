---
name: e2ee-audit
description: "Аудит End-to-End шифрования мессенджера: ключевая инфраструктура, протокол обмена, forward secrecy, групповые чаты, хранение ключей, атаки на E2EE. Use when: E2EE, шифрование, ключи, MessageKeyBundle, проверить безопасность переписки."
argument-hint: "[путь к E2EE модулям или '*' для поиска по всему проекту]"
user-invocable: true
---

# E2EE Audit — Мессенджер End-to-End Encryption

Аудит в 6 фазах: Key Management → Key Exchange → Encryption → Storage → Group Messaging → Attacks.

---

## Фаза 1: Инвентаризация

```bash
# Найти все E2EE файлы
find src/ -name "*.ts" -exec grep -l "encrypt\|decrypt\|keyPair\|MessageKey\|PrivateKey" {} \;
find src/ supabase/functions/ -name "e2ee*" -o -name "*crypto*" -o -name "*cipher*"

# Найти таблицы ключей
grep -rn "message_keys\|key_bundle\|prekey\|signed_prekey" supabase/migrations/
```

**Паттерны нашего проекта:**
- `src/lib/e2ee/` — legacy (должен быть удалён)
- `src/calls-v2/` — E2EE для звонков
- `MessageKeyBundle` паттерн — для зашифрованных чатов

---

## Фаза 2: Алгоритмы

### Проверяем используемые алгоритмы

```bash
grep -rn "algorithm\|AES\|RSA\|ECDH\|X25519\|XChaCha\|AES-GCM" src/ supabase/
grep -rn "crypto\.subtle\|SubtleCrypto\|getRandomValues" src/
grep -rn "importKey\|exportKey\|generateKey\|deriveKey" src/
```

### Стандарт для мессенджера (Signal Protocol)

| Алгоритм | Назначение | Статус |
|---|---|---|
| X25519 (ECDH) | Key exchange | ✅ Рекомендован |
| XChaCha20-Poly1305 | Симм. шифрование | ✅ Рекомендован |
| AES-256-GCM | Альтернатива | ✅ Допустим |
| Ed25519 | Подписи | ✅ Рекомендован |
| HKDF-SHA256 | KDF | ✅ Рекомендован |

### Запрещённые алгоритмы

```bash
grep -rn "MD5\|SHA1\|DES\|3DES\|RC4\|ECB" src/ supabase/
grep -rn "Math\.random()" src/lib/  # не для крипто!
```

**Блокируют деплой:**
- AES-ECB (нет аутентификации, нет IV)
- MD5/SHA1 для HMAC подписей
- RSA < 2048 бит
- Math.random() для ключей/nonce

---

## Фаза 3: Key Management

### 3.1 Генерация ключей

```typescript
// ✅ ПРАВИЛЬНО — Web Crypto API
const keyPair = await crypto.subtle.generateKey(
  { name: 'ECDH', namedCurve: 'P-256' },  // или X25519
  true,           // extractable: true для export/import
  ['deriveKey', 'deriveBits']
);

// ❌ НЕПРАВИЛЬНО
const key = CryptoJS.lib.WordArray.random(32);  // устаревшая библиотека
```

### 3.2 Хранение приватных ключей

```bash
grep -rn "localStorage\|sessionStorage" src/lib/e2ee/ src/calls-v2/
grep -rn "privateKey\|private_key" src/ | grep "localStorage\|set("
```

| Хранилище | Безопасность | Рекомендация |
|---|---|---|
| IndexedDB | 🟡 Средняя | Допустимо с шифрованием |
| localStorage | 🔴 Плохая | Только для non-sensitive |
| Память (RAM) | ✅ Хорошая | Очищать при logout |
| Keychain (iOS) | ✅ Отлично | Через Capacitor |

**Чеклист:**
- [ ] Приватные ключи НЕ в localStorage в plain text
- [ ] Приватные ключи зашифрованы passphrase если в хранилище
- [ ] Очистка ключей при logout
- [ ] Rotation: старые ключи вытесняются новыми

### 3.3 Key rotation / Forward Secrecy

```bash
grep -rn "ratchet\|ephemeral\|one-time\|prekey" src/
```

**Forward secrecy** — компрометация текущего ключа не раскрывает прошлые сообщения.

- [ ] Ephemeral keys для каждой сессии
- [ ] Double Ratchet или аналог (новый ключ каждое сообщение)
- [ ] One-time prekeys отзываются после использования

---

## Фаза 4: Шифрование сообщений

### 4.1 IV/Nonce

```bash
grep -rn "iv\s*=\|nonce\s*=" src/lib/ src/calls-v2/
grep -rn "getRandomValues" src/  # должен быть для каждого IV
```

```typescript
// ✅ ПРАВИЛЬНО — уникальный IV каждый раз
const iv = crypto.getRandomValues(new Uint8Array(12));  // 96-bit для AES-GCM
const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);

// ❌ НЕПРАВИЛЬНО — статический IV
const iv = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
```

**Чеклист:**
- [ ] IV/nonce генерируется случайно для каждого сообщения
- [ ] IV хранится вместе с шифртекстом
- [ ] Нет повторного использования (iv, key) пар

### 4.2 Аутентификация шифртекста (AEAD)

- [ ] Все шифрованные данные имеют MAC/authentication tag
- [ ] AES-GCM: authentication tag 128 бит (не 96)
- [ ] Отклонение при invalid auth tag (не silent fail)

---

## Фаза 5: Групповые чаты

```bash
grep -rn "group.*key\|GroupKey\|sender_key\|SenderKey" src/
```

### Подходы (Signal vs Telegram)

| Подход | Описание | Forward Secrecy |
|---|---|---|
| Sender Keys | Один ключ на группу (TreeKEM/MLS) | ✅ Да |
| Per-member E2EE | Каждому участнику шифруем отдельно | ❌ O(n) |
| Hybrid | Симм. ключ группы + асимм. обмен | 🟡 Частично |

**Чеклист:**
- [ ] Добавление/удаление участника → ротация ключа
- [ ] Удалённый участник не может читать новые сообщения
- [ ] Нет разглашения member list через key requests

---

## Фаза 6: Атаки на E2EE

### 6.1 Man-in-the-Middle

```bash
grep -rn "publicKey.*verify\|fingerprint\|safety_number" src/
```

- [ ] Key verification: safety numbers / fingerprint comparison
- [ ] Visual verification QR code (опционально)
- [ ] Уведомление при смене ключа

### 6.2 Key Compromise

- [ ] Application layer key = отдельно от транспортного TLS
- [ ] Нет key escrow (у провайдера нет plaintext)
- [ ] Нет vulnerability когда Supabase компрометирован → прочитает сообщения

### 6.3 Metadata leakage

```bash
grep -rn "created_at\|sender_id\|recipient_id" src/ | head -20
```

- [ ] Минимизация метаданных: не раскрывать sender/recipient паттерны
- [ ] Sealed sender (анонимная отправка) — если применимо

---

## Отчёт

```markdown
# E2EE Audit Report — {дата}

## Статус: [SECURE / AT_RISK / BROKEN]

### Ключевые риски
| Риск | Severity | Место |
|---|---|---|

### Алгоритмы
- Key exchange: [алгоритм]
- Bulk encryption: [алгоритм]
- Signature: [алгоритм]
- KDF: [алгоритм]

### Forward Secrecy: [ДА/НЕТ/ЧАСТИЧНО]

### Групповые чаты: [подход]

### Критические находки
...

### Рекомендации
...
```
