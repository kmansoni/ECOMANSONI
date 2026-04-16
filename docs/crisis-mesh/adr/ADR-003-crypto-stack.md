# ADR-003 — Crypto Stack

## Статус
Принято — 2026-04-17.

## Контекст
Mesh-сеть состоит из потенциально недоверенных relay-узлов. Нужно:
1. **Confidentiality** — relay не может прочитать payload
2. **Authenticity** — получатель верифицирует отправителя
3. **Integrity** — relay не может модифицировать пакет незаметно
4. **Forward secrecy** — компрометация ключа не раскрывает прошлые сообщения
5. **Identity binding** — peerId криптографически связан с ключом

## Решение

### Identity
- **Ed25519** keypair, генерируется при первом запуске
- `peerId = Base58(SHA-256(publicKey))[:16]` — 16-символьный fingerprint
- Приватный ключ хранится через `src/lib/e2ee/hardwareKeyStorage.ts`
  (Android Keystore / iOS Secure Enclave когда доступно)

### Session establishment
- **X3DH** — переиспользуем `src/lib/e2ee/x3dh.ts`
- Prekey bundle: `identity_pk (Ed25519) + signed_prekey (X25519) + signature + one-time-prekeys[]`
- Bundle транслируется **in-band** через broadcast (mesh) или out-of-band (QR)

### Message encryption
- **Double Ratchet** — переиспользуем `src/lib/e2ee/doubleRatchet.ts`
- Forward secrecy: каждое сообщение имеет свой ключ
- Post-compromise security через ratcheting

### Message signing (поверх encryption)
- **Ed25519** подпись identity-ключом отправителя
- Подписываем: `SHA-256(encryptedPayload || senderId || timestamp || initialHopCount || kind)`
- Relay верифицирует подпись **без расшифровки** → может отвергнуть подделки
- `initialHopCount` = 0 зафиксирован, чтобы relay не мог подделать hop counter

### Защита от атак

| Атака | Митигация |
|---|---|
| Sybil | Proof-of-Work для first-contact: `SHA-256(peerId \|\| nonce)` с ≥20 нулевых бит (~1с CPU) |
| Replay | Dedup + timestamp window ±5 минут; nonce unique per session |
| Tampering | Ed25519 signature поверх всего payload |
| Relay spoofing | `routePath` подписывается каждым relay (optional P1) |
| DoS flood | Rate-limit per peerId: 10 msg/min, SOS 1/5min |
| SOS abuse | PoW ≥24 бит для kind=sos (~10с CPU) |

### Локальное хранилище

IndexedDB шифруется через **AES-GCM** с ключом, производным от:
- Biometric unlock (Face/Touch ID / fingerprint) через `src/lib/e2ee/biometricUnlock.ts`
- Fallback: passkey через `src/lib/e2ee/webAuthnBinding.ts`
- Master encryption key хранится в Keystore/Secure Enclave

## Переиспользование существующего E2EE стека

| Модуль | Статус |
|---|---|
| `src/lib/e2ee/crypto.ts` | ✅ AES-GCM, ECDH — переиспользуем |
| `src/lib/e2ee/doubleRatchet.ts` | ✅ Ratchet для mesh-сессий |
| `src/lib/e2ee/x3dh.ts` | ✅ Initial handshake |
| `src/lib/e2ee/keyStore.ts` | ✅ IndexedDB key storage |
| `src/lib/e2ee/hardwareKeyStorage.ts` | ✅ Secure enclave binding |
| `src/lib/e2ee/biometricUnlock.ts` | ✅ Bio unlock |
| `src/lib/e2ee/nonceManager.ts` | ✅ Anti-replay |

### Новое (нет в проекте)
- `src/lib/crisis-mesh/crypto/identity.ts` — Ed25519 identity (Web Crypto API)
- `src/lib/crisis-mesh/crypto/signing.ts` — signing/verify envelope
- `src/lib/crisis-mesh/crypto/proof-of-work.ts` — PoW против Sybil/SOS spam

## Web Crypto API совместимость

- **Ed25519** поддержан в Chrome 135+, Safari 17+, Firefox 139+
- Для старых браузеров: fallback через `@noble/ed25519` (чистый JS, 5KB)

## Критерии приёмки
- Подпись/проверка 1000 пакетов: 100% корректных, 0% ложных
- PoW 20 бит генерится за 1-3 сек на среднем устройстве
- Подделка signature → verify возвращает false, relay не передаёт дальше
- Компрометация одного ключа не раскрывает сообщения других сессий
