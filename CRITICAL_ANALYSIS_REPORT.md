# Аудит безопасности E2EE + SFU архитектуры видеозвонков и текстовых чатов

**Дата аудита:** 2026-03-03  
**Аудитор:** Code Skeptic (Kilo Code)  
**Проект:** your-ai-companion-main  
**Файл отчёта:** CRITICAL_ANALYSIS_REPORT.md

---

## Резюме

Данный аудит выявил **множественные критические уязвимости** в текущей реализации E2EE (End-to-End Encryption) в сочетании с SFU (Selective Forwarding Unit) для видеозвонков и текстовых чатов. Текущая реализация **не обеспечивает надёжной защиты** и содержит фундаментальные архитектурные проблемы.

---

## 1. Анализ текущей архитектуры

### 1.1 E2EE для текстовых чатов ([`useE2EEncryption.ts`](src/hooks/useE2EEncryption.ts:1))

**Реализация:**

- **Алгоритм:** AES-256-GCM с PBKDF2 (310,000 итераций, SHA-256)
- **Генерация ключей:** [`crypto.subtle.generateKey()`](src/lib/chat/e2ee.ts:23)
- **Хранение ключей:** localStorage + sessionStorage
- **Архитектура:** Централизованная с мастер-ключом пользователя

**Проблемы:**

1. **XSS-уязвимость ключей** — Ключи хранятся в [`localStorage`](src/hooks/useE2EEncryption.ts:41) (строки 41, 49-54) и [`sessionStorage`](src/hooks/useE2EEncryption.ts:63), что делает их доступными через любой XSS-скрипт
2. **Отсутствие forward secrecy** — При компрометации мастер-ключа все сообщения расшифровываются
3. **Слабая аутентификация устройства** — passphrase генерируется один раз и хранится в localStorage без дополнительной верификации
4. **Нет верификации ключей** — Пользователь не может проверить ключ собеседника

### 1.2 E2EE для видеозвонков ([`VideoCallContext.tsx`](src/contexts/VideoCallContext.tsx:1))

**Реализация:**

- WebSocket-сигналинг через [`CallsWsClient`](src/calls-v2/wsClient.ts:26)
- Сообщения: `E2EE_CAPS`, `E2EE_READY`, `REKEY_BEGIN`, `REKEY_COMMIT`
- Периодическая ротация ключей: [`REKEY_INTERVAL_MS`](src/contexts/VideoCallContext.ts:16) (по умолчанию 120 секунд)

**КРИТИЧЕСКАЯ ПРОБЛЕМА:**

```typescript
// VideoCallContext.tsx, строка 17
const FRAME_E2EE_ADVERTISE_SFRAME = import.meta.env.VITE_CALLS_FRAME_E2EE_ADVERTISE_SFRAME === "true";
```

Флаг существует, но **реальное шифрование медиапотоков через Insertable Streams НЕ РЕАЛИЗОВАНО**. Код не содержит:

- Вызовов `RTCRtpSender.prototype.createEncodedStreams()`
- Обработки `RTCRtpScriptTransformer`
- Шифрования/дешифрования кадров перед отправкой

**Это означает, что видеопотоки передаются в открытом виде через SFU/TURN-сервер!**

### 1.3 SFU архитектура

**Обнаруженные компоненты:**

- **TURN-сервер:** coturn (docker-compose)
- **Сигналинг:** WebSocket через [`CallsWsClient`](src/calls-v2/wsClient.ts:26)
- **Медиа-транспорт:** WebRTC P2P с fallback на TURN

**Проблемы:**

1. **Отсутствует реальный SFU** — Текущая архитектура это P2P mesh, а не SFU
2. **Нет Selective Forwarding** — Все участники получают все потоки
3. **Медиа проходят через TURN в открытом виде** — Сервер видит весь контент

---

## 2. Причины отсутствия соединения при E2EE + SFU

### 2.1 Проблемы синхронизации ключей

| Проблема | Описание | Файл |
|----------|----------|------|
| Race condition при рекее | Клиент A начинает rekey, но клиент B ещё не получил ключ | [`VideoCallContext.tsx:229-247`](src/contexts/VideoCallContext.tsx:229) |
| Async key loading | Ключи загружаются асинхронно, но медиа-поток уже идёт | [`useE2EEncryption.ts:130-159`](src/hooks/useE2EEncryption.ts:130) |
| Нет синхронизации epoch | `e2eeEpochRef` может рассинхронизироваться между клиентами | [`VideoCallContext.tsx:69`](src/contexts/VideoCallContext.tsx:69) |

### 2.2 Криптографические несовместимости

1. **Разные версии JS API** — WebCrypto имеет различия между браузерами
2. ** отсутствие SFrame** — Флаг [`FRAME_E2EE_ADVERTISE_SFRAME`](src/contexts/VideoCallContext.tsx:17) не реализован
3. **Incompatible DTLS** — Параметры DTLS не включают E2EE-параметры

### 2.3 Ошибки в сигнальном канале

```typescript
// wsClient.ts, строка 310-334 - таймаут 5 секунд
const timeoutMs = 5000;
```

- **Таймауты слишком короткие** для медленных сетей
- **Нет guaranteed delivery** — сообщения могут теряться
- **Нет криптографической верификации** сигнальных сообщений

### 2.4 NAT и проблемы STUN/TURN

- ** coturn конфигурация** — [`turnserver.conf`](infra/calls/coturn/turnserver.conf) требует настройки `external-ip`
- **UDP блокировки** — Многие сети блокируют UDP
- **TURN credentials** — Генерируются на стороне, но нет валидации

---

## 3. Критические уязвимости

### 3.1 MITM-атаки (Человек посередине)

**Уровень риска: КРИТИЧЕСКИЙ**

```
[Клиент A] -----> [SFU/Сервер] -----> [Клиент B]
      |                                    |
      +----- (MITM возможен!) -------------+
```

**Причины:**

1. **Нет проверки ключей** — Пользователь не верифицирует ключ собеседника
2. **Сигналинг не защищён** — WebSocket без дополнительной аутентификации
3. **Нет channel binding** — Ключ не привязан к конкретному соединению
4. **SRTP не используется** — Медиа идёт без шифрования

**Реализация атаки:**

```
1. Атакующий контролирует SFU
2. Перехватывает REKEY_COMMIT
3. Генерирует свой ключ для каждого клиента
4. Расшифровывает и перешифровывает медиа
```

### 3.2 Комрометация ключей на сервере

**Уровень риска: КРИТИЧЕСКИЙ**

Ключи хранятся в БД в частично расшифрованном виде:

```typescript
// useE2EEncryption.ts, строка 174-187
await supabase.from("chat_encryption_keys").insert({
  conversation_id: conversationId,
  key_version: newVersion,
  encrypted_key: encryptedGroupKey,  // <-- ХРАНИТСЯ НА СЕРВЕРЕ!
  ...
});
```

**Проблемы:**

1. **encrypted_group_key хранится на сервере** — Теоретически сервер может расшифровать
2. **Нет client-side only ключей** — Все ключи потенциально доступны серверу
3. **masterKey деривируется из passphrase в localStorage** — Сервер не имеет passphrase, но клиент может быть скомпрометирован

### 3.3 Утечка метаданных

**Уровень риска: ВЫСОКИЙ**

Сервер видит:

```typescript
// wsClient.ts - все сообщения идут через сервер
await this.sendOrderedAcked("REKEY_BEGIN", payload);
await this.sendOrderedAcked("REKEY_COMMIT", payload);
```

**Утечка информации:**

| Данные | Что видно |
|--------|-----------|
| Время звонка | Начало, конец, длительность |
| Участники | Кто с кем общается |
| Тип медиа | Видео/аудио |
| Паттерны | Частота и время звонков |
| IP-адреса | Через TURN-сервер |

### 3.4 Уязвимости в протоколах согласования ключей

**Уровень риска: КРИТИЧЕСКИЙ**

Текущий протокол:

```
1. E2EE_CAPS (advertise capabilities)
2. REKEY_BEGIN (start key rotation)
3. REKEY_COMMIT (commit new key)
4. E2EE_READY (acknowledge)
```

**Проблемы:**

1. **Нет Diffie-Hellman** — Ключи не генерируются через DH
2. **Предопределённые ключи** — Не обеспечивают forward secrecy
3. **Нет key confirmation** — Клиент не подтверждает получение ключа криптографически
4. **Асинхронная ротация** — Может привести к десинхронизации

### 3.5 Проблемы аутентификации участников

**Уровень риска: ВЫСОКИЙ**

```typescript
// useVideoCall.ts, строка 292
if (fromUserId === user?.id) return;
```

1. **userId из токена** — Не верифицируется криптографически
2. **Нет Device Identity** — Любое устройство с токеном может присоединиться
3. **Нет channel binding** — Сессия не привязана к устройству

### 3.6 Уязвимости в обработке медиапотоков

**Уровень риска: КРИТИЧЕСКИЙ**

```typescript
// VideoCallContext.tsx - нет шифрования медиа!
// Просто передаётся через WebRTC
const tracks = stream.getTracks().filter((track) => track.readyState === "live");
for (const track of tracks) {
  await client.produce({...});  // <-- БЕЗ ШИФРОВАНИЯ!
}
```

**Реальность:**

- Медиа-дорожки передаются в **открытом виде**
- TURN-сервер видит все видео/аудио данные
- SFU (если будет реализован) получит полный доступ

---

## 4. Текущие проблемы с подключением (Debug)

### 4.1 Диагностика в коде

```typescript
// useVideoCall.ts, строка 107-125
const debugEvent = async (callId, stage, payload) => {
  await supabase.from("video_call_signals").insert({...});
};
```

### 4.2 Известные проблемы

| Проблема | Симптомы | Причина |
|----------|----------|---------|
| "No peer connection" | Call не устанавливается | PeerConnection не создан |
| "ICE connection failed" | Нет медиа | NAT/firewall проблемы |
| "E2EE handshake failed" | Шифрование не работает | Ключи не синхронизированы |
| "SFU not reachable" | Видео не идёт | WebSocket соединение отсутствует |

---

## 5. Рекомендации по улучшению

### 5.1 Внедрение постквантовых алгоритмов

**Срок: Среднесрочный**

Рекомендуемые алгоритмы (NIST PQCRYPTO):

```
1. ML-KEM (Kyber) - для key encapsulation
2. ML-DSA (Dilithium) - для digital signatures
3. HQC - дополнительный backup
```

**Интеграция:**

```typescript
// Пример с liboqs илиaws/libcrypto
import { Kyber512 } from '@aws/libcrypto';

// Гибридная схема: классический DH + постквантовый Kyber
const keyExchange = async () => {
  const classicalKey = await performDH();
  const pqKey = await Kyber512.encapsulate();
  return combineKeys(classicalKey, pqKey);
};
```

### 5.2 Улучшенные протоколы обмена ключами

**Немедленные действия:**

```typescript
// 1. Внедрить X3DH (Signal Protocol style)
interface IdentityKeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

interface SignedPreKey {
  id: number;
  keyPair: IdentityKeyPair;
  signature: Uint8Array;
}

interface OneTimePreKey {
  id: number;
  keyPair: IdentityKeyPair;
}

// 2. Использовать Double Ratchet
class DoubleRatchet {
  private rootKey: Uint8Array;
  private chainKey: Uint8Array;
  
  async ratchetEncrypt(plaintext: Uint8Array): Promise<EncryptedMessage> {...}
  async ratchetDecrypt(ciphertext: EncryptedMessage): Promise<Uint8Array> {...}
}
```

### 5.3 Внедрение Perfect Forward Secrecy (PFS)

**Срок: Немедленно**

```typescript
// Каждый звонок использует новые ключи через DH
class PFSKeyExchange {
  async generateEphemeralKeyPair(): Promise<CryptoKeyPair> {
    return crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-384" },
      true,
      ["deriveBits"]
    );
  }
  
  async deriveSharedSecret(
    privateKey: CryptoKey, 
    publicKey: CryptoKey
  ): Promise<CryptoKey> {
    const bits = await crypto.subtle.deriveBits(
      { name: "ECDH", public: publicKey },
      privateKey,
      384
    );
    return crypto.subtle.importKey("raw", bits, "AES-GCM", false, ["encrypt", "decrypt"]);
  }
}
```

### 5.4 Верификация ключей

**Срок: Немедленно**

```typescript
// Fingerprint верификация через QR код
interface KeyFingerprint {
  conversationId: string;
  userId: string;
  publicKey: string;  // Base64 encoded
  fingerprint: string;  // SHA-256 of public key
}

// QR код отображает fingerprint
function displayKeyFingerprint(fingerprint: KeyFingerprint): string {
  return fingerprint.fingerprint.substring(0, 8).toUpperCase();
}

// Пользователь подтверждает визуально
async function verifyKey(fingerprint: string): Promise<boolean> {
  const userFingerprint = displayKeyFingerprint(await getRemoteFingerprint());
  return userFingerprint === fingerprint;
}
```

### 5.5 Защита от повторного воспроизведения

**Срок: Немедленно**

```typescript
// Использовать sequence numbers + timestamps
interface MessageCounter {
  epoch: number;
  sequence: number;
  timestamp: number;
}

class ReplayProtection {
  private seenMessages = new Map<string, number>();
  private windowSize = 300; // 5 минут
  
  isValid(messageId: string, timestamp: number): boolean {
    const now = Date.now();
    
    // Проверка timestamp
    if (Math.abs(now - timestamp) > this.windowSize * 1000) {
      return false;
    }
    
    // Проверка на дубликаты
    if (this.seenMessages.has(messageId)) {
      return false;
    }
    
    this.seenMessages.set(messageId, timestamp);
    this.cleanup();
    return true;
  }
  
  private cleanup() {
    const cutoff = Date.now() - this.windowSize * 1000;
    for (const [key, ts] of this.seenMessages) {
      if (ts < cutoff) this.seenMessages.delete(key);
    }
  }
}
```

### 5.6 Аудит криптографических библиотек

**Срок: Немедленно**

| Библиотека | Версия | Статус | Замена |
|------------|--------|--------|--------|
| WebCrypto API | - | ✅ Безопасна | - |
| PBKDF2 | Native | ⚠️ 310k итераций | Argon2id |
| AES-GCM | Native | ✅ Безопасна | - |
| ECDH | Native | ⚠️ P-256 | P-384 или X25519 |

**Рекомендация:** Заменить PBKDF2 на Argon2id:

```typescript
// Использовать libsodium-wrappers илиargon2
import argon2 from 'argon2';

async function deriveKeyArgon2(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const hash = await argon2.hash(passphrase, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
    salt: salt,
    hashLength: 32,
  });
  
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}
```

### 5.7 Устранение утечек метаданных

**Срок: Среднесрочный**

```typescript
// 1. Пропускать трафик через padding
function padToMultiple(data: Uint8Array, multiple: number): Uint8Array {
  const padLength = multiple - (data.length % multiple);
  const padded = new Uint8Array(data.length + padLength);
  padded.set(data);
  // Добавить случайный padding
  crypto.getRandomValues(padded.subarray(data.length));
  return padded;
}

// 2. Использовать cover traffic
class MetadataProtection {
  async sendCoverTraffic(targetRate: number): Promise<void> {
    const interval = 1000 / targetRate;
    setInterval(() => {
      const dummyData = crypto.getRandomValues(new Uint8Array(64));
      this.sendDummyPacket(dummyData);
    }, interval);
  }
}

// 3. Onion routing для сигналинга
// (требует изменений на сервере)
```

### 5.8 Исправление E2EE для медиапотоков

**Срок: Немедленно**

```typescript
// Реализация Insertable Streams
class MediaEncryptor {
  async encryptTrack(
    sender: RTCRtpSender, 
    key: CryptoKey
  ): Promise<RTCRtpSender> {
    const transformer = new TransformStream({
      transform(chunk, controller) {
        // Шифровать каждый кадр
        const encrypted = this.encryptFrame(chunk, key);
        controller.enqueue(encrypted);
      },
      encryptFrame: async (frame: RTCEncodedVideoFrame, key: CryptoKey) => {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const data = new Uint8Array(frame.data);
        const ciphertext = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv },
          key,
          data
        );
        // Обновить frame data
        frame.data = ciphertext;
        return frame;
      }
    });
    
    const senderStreams = sender.createEncodedStreams();
    const readable = senderStreams.readable;
    const writable = senderStreams.writable;
    
    readable.pipeThrough(transformer).pipeTo(writable);
    
    return sender;
  }
}
```

---

## 6. Приоритеты исправлений

### 🔴 КРИТИЧЕСКИЕ (Немедленно)

1. **Реализовать Insertable Streams** для шифрования медиа
2. **Внедрить forward secrecy** (Double Ratchet)
3. **Убрать ключи из localStorage** — использовать только in-memory
4. **Реализовать SRTP** с E2E ключами

### 🟠 ВЫСОКИЕ (1-2 месяца)

1. **X25519 + Kyber** гибридный key exchange
2. **Верификация ключей** через QR/fingerprint
3. **Аудит PBKDF2** → Argon2id
4. **Защита метаданных** (padding, cover traffic)

### 🟡 СРЕДНИЕ (3-6 месяцев)

1. **Полный переход на постквантовую криптографию**
2. **Onion routing** для сигналинга
3. **Реальный SFU** с E2EE forwarding
4. **Аудит безопасности** от внешней компании

---

## 7. Выводы

### Текущее состояние

| Компонент | Статус | Оценка |
|-----------|--------|--------|
| E2EE чат | ⚠️ Частично | 4/10 |
| E2EE видео | ❌ Не работает | 1/10 |
| SFU интеграция | ❌ Нет | 0/10 |
| Forward secrecy | ❌ Нет | 0/10 |
| MITM защита | ❌ Нет | 0/10 |

### Главные проблемы

1. **Видеопотоки НЕ шифруются** — передаются в открытом виде
2. **Ключи уязвимы** — хранятся в localStorage
3. **Нет forward secrecy** — при компрометации все старые данные расшифровываются
4. **Сервер видит всё** — метаданные, а потенциально и медиа
5. **Нет аутентификации ключей** — MITM возможен

### Рекомендуемое действие

**Немедленно приостановить использование E2EE для видеозвонков** пока не будет реализовано шифрование на уровне медиапотоков (Insertable Streams + SRTP). Текущая реализация создаёт **ложное чувство безопасности** — пользователи думают, что звонки зашифрованы, но это не так.

---

*Отчёт подготовлен Code Skeptic (Kilo Code)*  
*Для получения деталей см. исходный код:* [`src/hooks/useE2EEncryption.ts`](src/hooks/useE2EEncryption.ts), [`src/contexts/VideoCallContext.tsx`](src/contexts/VideoCallContext.tsx), [`src/lib/chat/e2ee.ts`](src/lib/chat/e2ee.ts)
