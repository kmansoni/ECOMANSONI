# E2EE + SFU Module — Security Improvements Changelog

## Дата: 2026-03-03

## Обзор

Комплексное улучшение модуля сквозного шифрования (E2EE) и интеграции с SFU (Selective Forwarding Unit) для видеозвонков и текстовых чатов.

### Исправленные критические уязвимости

| # | Уязвимость | Критичность | Файл | Решение |
|---|-----------|-------------|------|---------|
| 1 | Мастер-ключ E2EE в localStorage (XSS) | 🔴 CRITICAL | useE2EEncryption.ts | Миграция в IndexedDB с non-extractable CryptoKey |
| 2 | Групповой ключ не распространяется участникам | 🔴 CRITICAL | useE2EEncryption.ts | ECDH key agreement + AES-KW distribution |
| 3 | Hardcoded TURN credentials | 🔴 CRITICAL | webrtc-config.ts | Удалены, только динамические через edge function |
| 4 | Нет E2EE для медиастримов | 🔴 CRITICAL | — | SFrame + Insertable Streams (MediaEncryptor) |
| 5 | AES-GCM без AAD | 🟡 MEDIUM | e2ee.ts | AAD = conversationId:keyVersion:senderId |
| 6 | In-memory rooms на сервере | 🟡 MEDIUM | calls-ws/index.mjs | (Documented, Redis migration planned) |
| 7 | Join Token replay — process-local | 🟡 MEDIUM | calls-ws/index.mjs | Redis-backed distributed replay protection |
| 8 | SFrame не enforcement | 🟡 MEDIUM | sfu/index.mjs | SFrame header validation на producer |
| 9 | Нет WSS enforcement | 🟡 MEDIUM | wsClient.ts | WSS enforcement с config.requireWss |
| 10 | p2p_mode не используется | 🟡 MEDIUM | webrtc-config.ts | Интеграция P2PMode + ICE candidate filtering |
| 11 | Placeholder TURN secrets | 🟡 MEDIUM | turnserver.prod.conf | (Documented, requires manual replacement) |
| 12 | Один mediasoup worker | 🟡 MEDIUM | mediaPlane.mjs | Multi-worker с round-robin |
| 13 | Payload типизированы как any | 🟡 MEDIUM | wsClient.ts, types.ts | Строгие TypeScript интерфейсы |

---

## Фаза 1: Криптографическая библиотека

### `src/lib/e2ee/crypto.ts` — новый файл

- **ECDH P-256** key generation и raw export/import
- **HKDF-SHA-256** для derivation из shared secret с salt и info
- **AES-256-GCM** encrypt/decrypt с обязательным AAD (`conversationId:keyVersion:senderId`)
- **AES-KW** (AES-256 Key Wrap, RFC 3394) для безопасной передачи ключей
- **Safety numbers** — SHA-256 fingerprint двух публичных ключей для верификации identity
- **NonceManager** — глобальный счётчик nonce с защитой от повтора

### `src/lib/e2ee/keyStore.ts` — новый файл

- Хранилище ключей в **IndexedDB** (не localStorage — защита от XSS)
- CryptoKey хранится с `extractable: false` — нельзя извлечь через JS
- **PBKDF2-SHA-256** с 600 000 итерациями для password-based encryption
- Автоматическая миграция при смене версии схемы

### `src/lib/e2ee/sframe.ts` — новый файл

- Реализация **SFrame codec** для шифрования медиафреймов (draft-ietf-sframe)
- Encode: добавляет SFrame header (KID + counter) перед зашифрованным payload
- Decode: валидирует header, расшифровывает AES-GCM
- Поддержка ротации ключей через Key ID (KID)

---

## Фаза 2: Key Distribution + хук

### `src/lib/e2ee/keyDistribution.ts` — новый файл

- **ECDH key agreement** между отправителем и каждым получателем
- Shared secret → HKDF → wrapping key → AES-KW wrap группового ключа
- Поддержка late joiners: повторная отправка wrapped key для нового участника
- Rekey protocol: генерация нового группового ключа + перераспределение всем участникам

### `src/hooks/useE2EEncryption.ts` — полностью переписан

**До:** localStorage, extractable CryptoKey, нет key distribution  
**После:**
- Генерация и хранение ECDH keypair в IndexedDB
- Загрузка публичных ключей участников из Supabase (`user_encryption_keys`)
- Key distribution через `keyDistribution.ts`
- Safety numbers для верификации собеседника
- Поддержка encrypt/decrypt с версионированием ключей

---

## Фаза 3: WebSocket клиент

### `src/calls-v2/types.ts` — изменён

- Строгие TypeScript интерфейсы для всех WS payload (устранён `any`)
- Типы: `RoomJoinPayload`, `KeyPackagePayload`, `RekeyBeginPayload`, `PeerJoinedPayload`, и др.
- Enum `WsMessageType` для всех типов сообщений

### `src/calls-v2/wsClient.ts` — изменён

- **WSS enforcement**: отклоняет `ws://` если `config.requireWss = true`
- Строгая типизация всех исходящих и входящих сообщений
- **Connection state tracking**: `connecting | open | closing | closed`
- **Deduplication** последних 10 000 message ID для защиты от replay
- Reconnect с exponential backoff

---

## Фаза 4: Серверная часть

### `server/sfu/index.mjs` — изменён

- **SFrame header validation** на каждом producer: отклоняет фреймы без корректного SFrame header
- **Rate limiting**: max 100 сообщений/сек на peer, защита от flood
- **REKEY broadcast fix**: REKEY теперь рассылается всем участникам комнаты (был баг — только инициатору)
- Логирование security events

### `server/calls-ws/index.mjs` — изменён

- **Distributed join tokens**: Redis-backed replay protection (вместо process-local Map)
- **KEY_PACKAGE validation**: проверка структуры и подписи при получении KeyPackage
- Токены join имеют TTL 60 сек, хранятся в Redis SET

### `server/sfu/mediaPlane.mjs` — изменён

- **Multi-worker mediasoup**: количество workers = `os.cpus().length`
- **Round-robin** распределение новых транспортов по workers
- Изоляция падения одного worker от остальных

---

## Фаза 5: WebRTC + Insertable Streams

### `src/lib/webrtc-config.ts` — изменён

**До:**
```typescript
// Hardcoded TURN credentials
iceServers: [{ urls: 'turn:turn.example.com', username: 'user', credential: 'pass' }]
// p2p_mode игнорировался
// ICE candidates не фильтровались
```

**После:**
- Credentials только через edge function (динамические ephemeral tokens, TTL 1h)
- `P2PMode` интегрирован: в P2P режиме SFU транспорт не создаётся
- ICE candidate filtering: в P2P — только host/srflx, в SFU — только relay

### `reserve/calls/baseline/src/lib/webrtc-config.ts` — изменён

Аналогичные исправления для baseline реализации.

### `src/lib/e2ee/insertableStreams.ts` — новый файл

- **`MediaEncryptor`** класс: интеграция SFrame с WebRTC Insertable Streams API
- Для каждого RTCRtpSender/Receiver создаёт TransformStream
- Encrypt pipeline: raw frame → SFrame encode → зашифрованный frame
- Decrypt pipeline: зашифрованный frame → SFrame decode → raw frame
- Graceful fallback если Insertable Streams не поддерживаются браузером

---

## Новые файлы

| Файл | Описание |
|------|----------|
| `src/lib/e2ee/crypto.ts` | Криптографическая библиотека: ECDH P-256, AES-256-GCM+AAD, HKDF, AES-KW, safety numbers |
| `src/lib/e2ee/keyStore.ts` | Безопасное хранилище ключей в IndexedDB |
| `src/lib/e2ee/sframe.ts` | SFrame codec для шифрования медиафреймов |
| `src/lib/e2ee/keyDistribution.ts` | Протокол распространения ключей через ECDH |
| `src/lib/e2ee/insertableStreams.ts` | Интеграция SFrame с WebRTC Insertable Streams |
| `src/lib/e2ee/index.ts` | Barrel export |
| `docs/e2ee-sfu-architecture.md` | Архитектурный blueprint (10 разделов) |

## Изменённые файлы

| Файл | Изменения |
|------|-----------|
| `src/hooks/useE2EEncryption.ts` | Полностью переписан: ECDH, IndexedDB, key distribution, safety numbers |
| `src/calls-v2/types.ts` | Строгие типы для всех WS payload |
| `src/calls-v2/wsClient.ts` | WSS enforcement, типизация, connection state, dedup 10K |
| `src/lib/webrtc-config.ts` | Удалены hardcoded creds, P2PMode, ICE filtering, TTL 1h |
| `reserve/calls/baseline/src/lib/webrtc-config.ts` | Аналогичные исправления |
| `server/sfu/index.mjs` | SFrame validation, rate limiting, REKEY broadcast fix |
| `server/calls-ws/index.mjs` | Distributed join tokens, KEY_PACKAGE validation |
| `server/sfu/mediaPlane.mjs` | Multi-worker mediasoup |

---

## Криптографический стек

| Алгоритм | Назначение | Стандарт |
|----------|-----------|----------|
| ECDH P-256 | Key agreement | NIST SP 800-56A |
| HKDF-SHA-256 | Key derivation | RFC 5869 |
| AES-256-GCM | Symmetric encryption | NIST SP 800-38D |
| AES-KW | Key wrapping | RFC 3394 |
| PBKDF2-SHA-256 | Password-based KDF | RFC 8018, 600K iterations |
| SFrame | Media frame encryption | draft-ietf-sframe |
| SHA-256 | Fingerprints, safety numbers | FIPS 180-4 |

---

## Требования к Supabase

Для работы нового E2EE модуля необходимы таблицы:

```sql
-- Публичные ключи пользователей
CREATE TABLE IF NOT EXISTS user_encryption_keys (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  public_key_raw TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Обёрнутые групповые ключи
CREATE TABLE IF NOT EXISTS chat_encryption_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL,
  key_version INTEGER NOT NULL,
  recipient_id UUID NOT NULL REFERENCES auth.users(id),
  sender_id UUID NOT NULL REFERENCES auth.users(id),
  wrapped_key TEXT NOT NULL,
  sender_public_key_raw TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(conversation_id, key_version, recipient_id)
);

-- RLS policies
ALTER TABLE user_encryption_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_encryption_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read any public key"
  ON user_encryption_keys FOR SELECT
  USING (true);

CREATE POLICY "Users can manage own public key"
  ON user_encryption_keys FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can read own encryption keys"
  ON chat_encryption_keys FOR SELECT
  USING (auth.uid() = recipient_id);

CREATE POLICY "Users can insert encryption keys"
  ON chat_encryption_keys FOR INSERT
  WITH CHECK (auth.uid() = sender_id);
```

---

## Оставшиеся задачи (TODO)

1. **Post-quantum**: Интеграция X-Wing/ML-KEM hybrid key exchange (ожидает стабилизации Web Crypto API)
2. **Sealed sender**: Скрытие отправителя через промежуточный relay
3. **Message padding**: Fixed-bucket padding для скрытия размера сообщений
4. **Key transparency log**: Публичный аудит-лог изменений ключей
5. **QR-code verification**: UI для сканирования QR-кодов safety numbers
6. **Redis-backed rooms**: Миграция in-memory rooms в Redis
7. **TURN prod secrets**: Замена placeholder secrets в `turnserver.prod.conf`
8. **RTCRtpScriptTransform**: Поддержка spec-compliant API (когда будет широко доступен)
