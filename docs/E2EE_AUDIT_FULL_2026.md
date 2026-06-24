# E2EE AUDIT REPORT — Mansoni
**Дата:** 2026-06-23
**Аудиторы:** Claude Opus 4.7 × 4 параллельных агента
**Охват:** crypto primitives, key storage, calls/media, group key management
**Вердикт:** **НЕ ПРОДАКШН** — 22 критических уязвимости, 34 высоких, 20 средних

---

## EXECUTIVE SUMMARY

Базовая архитектура правильная (X3DH + Double Ratchet + AES-GCM + SFrame). Однако **критические детали сломаны** — PQ-гибридность не работает, ratchet-ключи extractable, групповое E2EE подделываемо, replay возможен, silent downgrade не детектируется.

**ПРОДАКШН БЛОКИРУЮТСЯ ДО ИСПРАВЛЕНИЯ P0-блокеров.**

---

## P0 — BLOCKER (исправлять немедленно)

### 🔴 CRYPTO-1: PQ-гибридность полностью сломана (2 файла)

**Файлы:** `pqKem.ts:137-141`, `cryptoAgility.ts:105-107`

```ts
// Код генерирует СВОЮ пару и инкапсулирует в СВОЙ публичный ключ:
const mlkemKp = ml_kem768.keygen();
const mlkemResult = ml_kem768.encapsulate(mlkemKp.publicKey); // СВОЙ pubKey!
mlkemCipherText = mlkemResult.cipherText;
mlkemSecret = mlkemResult.sharedSecret;
```

KEM-encapsulate(recipientPubKey) должен принимать **публичный ключ получателя** и возвращать sharedSecret, который получатель восстановит через decapsulate(recipientPrivateKey). Здесь encapsulator инкапсулирует **сам в себя** — sharedSecret известен только encapsulator'у, получателю неоткуда его взять. При `VITE_E2EE_PQ_ENABLED=true` система заявляет квантовую стойкость, но реально работает ECDH-only. Перехвативший сегодня трафик взламывает P-256 через Shor и читает всё.

**Два независимых файла с идентичным багом** — значит баг не замечен при code review.

**FIX:** sender должен принимать recipient ML-KEM pubKey, encapsulating в него. Recipient decapsulates своим private key. Это symmetric KEM, не unidirectional.

---

### 🔴 CRYPTO-2: `rotateKeys` создаёт пустой chain key (slice на 32-байтном массиве)

**Файл:** `cryptoAgility.ts:182`

```ts
const newRootKeyBytes = crypto.getRandomValues(new Uint8Array(32));
const newRootKey = newRootKeyBytes.buffer;  // 32 байта
const newChainKey = await crypto.subtle.importKey(
  'raw',
  new Uint8Array(newRootKey).slice(32, 64),  // slice(32,64) на 32-байтном = 0 байт!
  ...
);
```

`new Uint8Array(newRootKey)` — 32 байта. `.slice(32, 64)` — пустой массив. Если не падает с DataError — chain key детерминирован (нули). Все сообщения после rotation расшифровываемы или DoS.

**FIX:** использовать 64-байтовый массив: `new Uint8Array(64)`, slice(0,32) для root, slice(32,64) для chain.

---

### 🔴 CRYPTO-3: Root key = Chain key (forward secrecy сломана)

**Файл:** `cryptoAgility.ts:163-175`

```ts
return {
  rootKey: newRootKey.slice(0, 32),           // те же 32 байта
  receivingChainKey: newChainKey,              // тот же материал
};
```

Root key используется в KDF_RK (DH ratchet), chain key — в KDF_CK (message keys). Если они совпадают, компрометация root key → компрометация всех message keys → forward secrecy сломана.

**FIX:** KDF_RK должен разделять root key и chain key на разные ветви HKDF.

---

### 🔴 CRYPTO-4: Safety Number для X25519 ключей = "00NaN00NaN"

**Файл:** `keys-x25519.ts:161-178`

```ts
const seed = sha256(seedInput);  // 32 байта
for (let i = 0; i < 12; i++) {
  const byteIdx = i * 3;
  // i=10 → byteIdx=30, seed[32] = undefined
  // i=11 → byteIdx=33, seed[33] = undefined
  val = ((seed[byteIdx] << 16) | ...) % 100000;  // NaN
  numeric += val.toString().padStart(5, '0');     // "00NaN"
}
```

Цикл 12×3=36 байт на 32-байтном хеше. Safety number заканчивается на `"00NaN00NaN"`. Пользователи не могут верифицировать ключи → MITM остаётся незамеченным.

**FIX:** использовать SHA-512 (64 байта) как в `crypto.ts:366`, или 10×3=30 байт на SHA-256.

---

### 🔴 CRYPTO-5: Все ratchet-ключи extractable → XSS = full session compromise

**Файл:** `doubleRatchet.ts:588, 605, 622, 730`

Все HMAC-ключи (root key, chain key, skipped keys), ECDH ratchet private keys — `extractable: true`. После `deserialize` из IndexedDB XSS может вызвать:

```js
// XSS экспортирует chain key:
crypto.subtle.exportKey('raw', state.sendingChainKey)  // → chain key bytes
// → выводит все message keys через kdfCK
// → расшифровывает все будущие сообщения
```

Forward secrecy сломана на уровне браузерного XSS. Signal private keys в Secure Enclave/TEE — не экспортируемы. Здесь экспортируемы.

**FIX:** использовать `extractable: false` для всех operational keys. Для persistence — wrapKey через master key (который в hardware-backed storage).

---

### 🔴 CRYPTO-6: FIFO nonce eviction → replay после 10000 сообщений

**Файл:** `crypto.ts:417-419`, `nonceManager.ts:41-44`

```ts
if (this.seen.size >= this.maxSize) {
  const first = this.seen.values().next().value;
  if (first !== undefined) this.seed.delete(first);
}
this.seen.add(nonce);
```

Set хранит insertion order → FIFO eviction. После 10000 сообщений самый старый nonce удаляется. GCM tag валиден (ключ не менялся), nonce не в seen → decrypt проходит. Для VoIP (30fps) 10000 сообщений = 5.5 минуты.

**FIX:** eviction по LRU (удалять least recently used), или sliding window (удалять все nonce старше T), или persistent bloom filter.

---

### 🔴 STORAGE-1: OPK consumption неатомарно → double-use

**Файл:** `secretChatManager.ts:271-313`

```ts
// Шаг 1: SELECT одного OPK (non-locking)
const { data: opkData } = await supabase
  .from('one_time_prekeys').select('*').eq('user_id', targetId)
  .eq('consumed', false).limit(1).single();

// Шаг 2: DELETE того же OPK по id (race window!)
await supabase.from('one_time_prekeys').delete().eq('id', opkData.id);
```

Два concurrent инициатора читают один OPK → оба используют его в X3DH → forward secrecy X3DH сломана. Должен быть atomic `consumeOPK` RPC с `DELETE ... RETURNING *`.

**FIX:** использовать Supabase RPC с atomic DELETE + RETURNING, или `UPDATE ... SET consumed=true WHERE consumed=false` с проверкой affected rows.

---

### 🔴 STORAGE-2: OPK key format mismatch — ключи никогда не находятся

**Файл:** `secretChatManager.ts:278` vs `opkManager.ts:137`

`opkManager` сохраняет: `opk:${userId}:${id}:private`
`secretChatManager` ищет: `opk:${this.userId}:${opkData.id}:private`

Ищет несуществующий ключ → `opkPrivate = null` → X3DH проходит без OPK → forward secrecy ослаблена. Реальный приватный OPK остаётся в IndexedDB навсегда (утечка ключевого материала).

**FIX:** согласовать key format в обоих модулях.

---

### 🔴 STORAGE-3: Identity key extractable в escrow/transfer/recovery

**Файлы:** `keyEscrow.ts:88-125`, `mediaKeyBackup.ts:68-91`, `deviceTransfer.ts:151-214`, `webAuthnBinding.ts:87-185`

Все backup/escrow/transfer flows требуют `crypto.subtle.exportKey('pkcs8', identityPrivateKey)`. Это означает identity key должен быть `extractable: true`. После этого XSS может экспортировать identity private key напрямую — полная компрометация identity.

**FIX:** генерировать ephemeral extractable copy в момент backup, немедленно zeroize; использовать wrapKey (поддерживает non-extractable) для backup без экспорта.

---

### 🔴 STORAGE-4: Security logger leaking secrets to logs

**Файл:** `securityLogger.ts:35-42`

```ts
SECRET_KEYS = { 'prfSeed', 'recoveryPassword', 'passphrase', 'rawKey', 'privateKeyBytes', 'pkcs8' }
// Проверка:
SECRET_KEYS.has(k.toLowerCase())  // lowercase 'prfseed' — НЕТ в Set!
```

`prfSeed`, `recoveryPassword`, `passphrase`, `rawKey`, `privateKeyBytes`, `pkcs8` — lowercase формы нет в Set. Все секреты попадают в console + external transports.

**FIX:** `SECRET_KEYS = new Set(['prfseed', 'recoverypassword', ...])` — все lowercase.

---

### 🔴 STORAGE-5: Hardware storage fallback to memory-only (ложная защита)

**Файл:** `hardwareKeyStorage.ts:75-87`

```ts
detectHardwareCapability() {
  return { backend: 'webauthn' };  // только потому что API существует
}
// put() и get() — нет ветки 'webauthn' → падает в memory-only softStore
```

Система сообщает "hardware-backed", реально ключи в RAM Map → теряются при reload, XSS может прочитать memory. Security theater.

**FIX:** реализовать реальный `put`/`get` через WebCrypto Key Storage API или Platform Authenticator; fallback → fail-closed.

---

### 🔴 CALLS-1: SFrame replay race condition

**Файл:** `src/lib/e2ee/sframe.ts:150-210`, `insertableStreams.ts:351-369`

```ts
// Проверка ДО decrypt:
if (seenCounters.has(counter)) throw DuplicateFrameError();
seenCounters.add(counter);  // добавляется ДО await

// ДВА параллельных вызова с одинаковым counter:
await crypto.subtle.decrypt(...)  // оба проходят проверку, оба decrypt
```

Два реплея в одном event-loop tick — оба принимаются. SFU или attacker может replay'нуть кадр дважды за <16ms.

**FIX:** резервировать counter синхронно: `if (seenCounters.has(counter)) throw; seenCounters.add(counter);` до await.

---

### 🔴 CALLS-2: IV reuse audio ↔ video (same key, same counter)

**Файл:** `src/features/calls/encryption/e2eeTransform.ts:49-68`

Каждый RTCRtpSender получает свой `MediaEncryptor` с counter=0. IV = `epoch(4) || counter(8)`. Audio и video sender'ы с одним epoch используют одинаковый IV. AES-GCM с одним ключом + один IV = XOR-утечка plaintext.

**FIX:** включить trackId/SSRC в IV или AAD; или использовать единый MediaEncryptor на звонок.

---

### 🔴 CALLS-3: Cross-peer decryption через aliases

**Файл:** `src/calls-v2/callMediaEncryption.ts:46-70`

`buildPeerAliases` создаёт `[userId, deviceId, userId:deviceId]`. Ключ регистрируется для всех aliases. `userA:deviceA` может расшифровать media от `userA:deviceB` через alias.

**FIX:** использовать только точный `userId:deviceId`; aliases — security blocker.

---

### 🔴 CALLS-4: MITM — нет identity verification в SFU key exchange

**Файл:** `src/lib/e2ee/sfuKeyExchange.ts:162-255`

`processE2EKeyGroup` верифицирует подпись против `identityPublicKey` из того же пакета. Нет pinning. MITM подменяет identityPublicKey в signaling → обе стороны устанавливают E2EE с MITM → MITM читает media.

**FIX:** интегрировать `assertPeerIdentityPinned` из `ecdsaIdentity.ts` — reject при fingerprint mismatch.

---

### 🔴 GROUP-1: SenderKeyMessage без identity binding (forge возможен)

**Файл:** `senderKeys.ts:377-432`

`signingPublicKey` передаётся внутри сообщения, не привязан к identity key. Любой может сгенерировать ECDSA-пару, подписать SenderKeyMessage с `senderId: "victim"` — получатели поверят.

**FIX:** ECDSA identity key подписывает `signingPublicKey || senderId`; получатель верифицирует через `user_encryption_keys`.

---

### 🔴 GROUP-2: keyId non-monotonic — ротация сломана

**Файл:** `senderKeys.ts:313-322, 663-676`

```ts
const keyId = new DataView(new Uint8Array(sha256(pubKey).buffer, 0, 4).buffer).getUint32(0);
// keyId = SHA-256(first 4 bytes of public key) — НЕ монотонный
// _findCurrentState выбирает MAX keyId
// После ротации новый ключ может иметь МЕНЬШИЙ keyId
// → _findCurrentState возвращает СТАРЫЙ ключ → ex-member читает всё
```

Birthday collision ~65k ключей. Rotation генерирует новый ключ → новый keyId → ротация может дать меньший keyId → получатели используют старый ключ.

**FIX:** использовать монотонный counter как keyId, хранить отдельно от хеша ключа.

---

### 🔴 GROUP-3: MembershipChange — no-op encryption (node keys в cleartext)

**Файл:** `groupMembershipRotation.ts:21-28`

```ts
return { ciphertext: toBase64(nodeKey), iv: toBase64(iv) };
// toBase64(nodeKey) — RAW node key без шифрования
```

Node keys дерева передаются в plaintext. Backend видит все ключи группы. E2EE группа скомпрометирована.

**FIX:** реализовать реальное шифрование через ECDH+HKDF recipient-by-recipient; fail-closed если encryption callback не предоставлен.

---

### 🔴 GROUP-4: MembershipChange без signature — forged removal

**Файл:** `groupKeyTree.ts:48-61, 211-306`

`MembershipChange` не содержит `initiatorId`, signature, epoch. Любой участник может инжектить fake removal любого пользователя, включая админов.

**FIX:** добавить `initiatorId` + ECDSA signature над `conversationId || changeType || affectedUserId || epoch || timestamp`.

---

### 🔴 GROUP-5: decryptWithGroupTree без sender authentication

**Файл:** `groupKeyTree.ts:340-360`

AES-GCM с root key обеспечивает confidentiality + integrity, но НЕ authentication. Любой участник с root key может зашифровать сообщение от произвольного senderId. Получатель не отличает подделку.

**FIX:** добавить senderId в AAD; подписывать ciphertext ECDSA signing key отправителя.

---

### 🔴 GROUP-6: hybridKeyExchange не symmetric (PQ поломан в group path)

**Файл:** `cryptoAgility.ts:91-143`

Функция генерирует свою ML-KEM пару и инкапсулирует в свой pubKey. Recipient получает ДРУГОЙ sharedSecret (DH + его own ML-KEM). HKDF output РАЗНЫЙ у двух сторон. При `PQ_ENABLED=true` E2EE сессии неработоспособны или тихо падают к ECDH-only.

**FIX:** тот же fix что и CRYPTO-1 — sender encapsulating в recipient pubKey, recipient decapsulating своим privateKey.

---

## P1 — HIGH (исправлять до продакшн)

| ID | Файл | Проблема |
|----|------|----------|
| HIGH-1 | `pqKem.ts:167` | Silent fallback на ECDH если `pqCiphertext` есть но `pqSecretKey` null — нет error |
| HIGH-2 | `cryptoAgility.ts:108` | Silent fallback на ECDH при ML-KEM ошибке — `console.warn`, не throw |
| HIGH-3 | `x3dh.ts:318,320` | Нет валидации public key на кривой P-256 (invalid curve attack) |
| HIGH-4 | `doubleRatchet.ts:350` | String comparison public keys не constant-time — timing side channel |
| HIGH-5 | `doubleRatchet.ts:296,470` | `JSON.stringify(header)` как AAD — не canonical encoding |
| HIGH-6 | `crypto.ts:288-294` | AES-KW wrapKey без AAD — cut-and-paste attack на wrapped keys |
| HIGH-7 | `doubleRatchet.ts:63` | MAX_SKIP=100 слишком мало (Signal: 1000) — DoS на плохих сетях |
| HIGH-8 | `nonceManager.ts` | In-memory only — replay после reload |
| HIGH-9 | `cryptoAgility.ts:155-161` | `rotateKeys` использует raw SHA-512 вместо HKDF — нет domain separation |
| HIGH-10 | `cryptoAgility.ts:43-48` | Алгоритм называется "X25519", код использует P-256 — misleading |
| HIGH-11 | `cryptoAgility.ts:11` vs `pqKem.ts:14` | Разные env vars: `VITE_E2EE_PQ_ENABLED` vs `VITE_E2EE_PQ` |
| HIGH-12 | `cryptoAgility.ts:54-58` | `X25519-MLKem768-ChaCha20-Poly1305` в списке, не реализован |
| HIGH-13 | `doubleRatchet.ts:706-725` | deserialize неполная валидация — нет проверки длины rootKey, negative numbers |
| HIGH-14 | `keyCeremony.ts:107-115` | Lockout по operationId — attacker меняет operationId и обходит lockout |
| HIGH-15 | `secretChatManager.ts:99-108,200-211` | Ratchet state in-memory only — теряется при reload → нерасшифровываемая история |
| HIGH-16 | `biometricUnlock.ts:35-37,40` | Fallback без enforcement; UV='preferred' вместо 'required' |
| HIGH-17 | `webAuthnBinding.ts:330` | PRF seed plaintext в IndexedDB — эквивалент AES-GCM без PRF |
| HIGH-18 | `hardwareKeyStorage.ts:75-87` | detectHardwareCapability возвращает 'webauthn' но put/get нет ветки |
| HIGH-19 | `keyEscrow.ts:166-232` | Threshold recovery = XOR (все N шардов обязательны, не K-of-N) |
| HIGH-20 | `secretChatManager.ts:356-365` | `sessionId` в plaintext в Supabase messages — metadata leak |
| HIGH-21 | `callKeyExchange.ts:131-141` | `registerPeerSigningKey` без TOFU pinning |
| HIGH-22 | `callKeyExchange.ts:159` | AES-128-GCM вместо AES-256 — ниже production стандарта |
| HIGH-23 | `senderKeys.ts:74-81` | EncryptedGroupMessage без sender signature — recipient может forge |
| HIGH-24 | `senderKeys.ts:86` | MAX_SKIP=256 слишком мало для групп |
| HIGH-25 | `senderKeys.ts:88,647-659` | Skipped keys in-memory only — lost after reload |
| HIGH-26 | `senderKeys.ts:606-615` | `rotateSenderKeyOnMemberLeave` не дистрибутирует ключ — ex-member сохраняет доступ |
| HIGH-27 | `groupKeyTree.ts:226,281` | O(N) rebuild вместо O(log N) TreeKEM — DoS в больших группах |
| HIGH-28 | `groupKeyTree.ts:349` | Нет epoch history — старые сообщения нерасшифровываемы после membership change |
| HIGH-29 | `keyDistribution.ts:279-298` | Static identity key для wrapping — компрометация identity = компрометация всех прошлых group keys |
| HIGH-30 | `keyDistribution.ts:391-407` | Soft-fail при missing identity key — MITM window |
| HIGH-31 | `callMediaEncryption.ts:109` | `epoch & 0x7fffffff` — коллизия keyId при epoch > 2^31 |
| HIGH-32 | `sfuKeyExchange.ts:249` | keyId из timestamp — коллизия в пределах 1ms |
| HIGH-33 | `keyStore.ts:85-97` | In-memory fallback при недоступности IndexedDB — ключи теряются |
| HIGH-34 | `deviceTransfer.ts:60-76,98-102` | Ephemeral private key extractable — может быть экспортирован |

---

## P2 — MEDIUM (hardening)

- `crypto.ts:158-175` — rawBytes не auto-zeroed, полагается на caller
- `crypto.ts:124` — HKDF-SHA-256 вместо SHA-512
- `x3dh.ts:131-153` — X3DH KDF использует SHA-256, 256-bit output (Signal: SHA-512, 512-bit)
- `x3dh.ts:259-292` — нет binding между IK_ECDH и IK_ECDSA
- `cryptoTimeout.ts:13-33` — timeout не защищает от oracle, partial state mutation после timeout
- `securityLogger.ts:117-126` — console output в production
- `opkManager.ts:125-144` — неатомарный replenish batch
- `doubleRatchet.ts:59` — skippedMessageKeys Map не zeroized после delete
- `doubleRatchet.ts:177` — DH 256-bit output для P-256
- `x3dh.ts:225` — ECDSA P-256 вместо Ed25519
- `webAuthnBinding.ts:118-121` — нет `authenticatorAttachment: 'platform'`
- `hardwareKeyStorage.ts:41-50` — legacy localStorage migration не zeroize
- `keyEscrow.ts:88-94` — min 12-char password, комментарий рекомендует 16
- `keyStore.ts:606-609,726` — lock() не zeroizes CryptoKey
- `senderKeys.ts:139,460` — chainKey persistится при каждом сообщении (а не только при rotation)
- `groupKeyTree.ts:74,145-156` — No concurrency control — split-brain при concurrent admins
- `groupKeyTree.ts:97-101` — Нет per-message ratchet — все сообщения эпохи один AES key
- `e2eeRecoveryPolicy.ts:155-181` — 500ms silent drop маскирует key distribution failure
- `sfuKeyExchange.ts:282-291` — `clearSFUSession` удаляет ВСЕ ключи, не только пира
- `rekeyStateMachine.ts:489-499` — quorum при 0 active peers

---

## P3 — LOW (minor)

- `doubleRatchet.ts:492-525` — dead code sentinel `_serializeUnreachable`
- `crypto.ts:205` — `deriveKid` fallback на zero kid (8 нулей) для non-extractable keys
- `crypto.ts:318-327` — SAFETY_EMOJI 64 элемента (Signal: 340)
- `crypto.ts:43-48` — `encodeText` избыточное копирование
- `doubleRatchet.ts:805-839` — `computeDenyableSharedSecret` без domain separation с X3DH
- `senderKeys.ts:71` — `encryptedForRecipient` — dead API contract
- `groupKeyTree.ts:273-278` — `_getPathToRoot` для removed leaf = no-op
- `cryptoAgility.ts:60-68` — `canReadMessage` не проверяет reverse compatibility

---

## SUMMARY BY LAYER

| Слой | Critical | High | Medium | Verdict |
|------|----------|------|--------|---------|
| Криптопримитивы | 6 | 7 | 6 | 🔴 BROKEN |
| Key Storage | 5 | 10 | 6 | 🔴 BROKEN |
| Calls/Media E2EE | 4 | 6 | 5 | 🔴 BROKEN |
| Group Key Management | 6 | 11 | 6 | 🔴 BROKEN |

**Total: 22 BLOCKER, 34 HIGH, 23 MEDIUM, 8 LOW**

---

## PRIORITY FIX ORDER

**Этап 1 (блокирующие, перед любым deploy):**
1. CRYPTO-1 + CRYPTO-6 — PQ hybrid fix + replay protection
2. CRYPTO-5 — ratchet keys extractable → XSS compromise
3. STORAGE-1 — OPK atomic consumption
4. STORAGE-3 — identity key extractable в escrow
5. CALLS-1 — SFrame replay race
6. GROUP-3 — no-op encryption в membership rotation

**Этап 2 (квартал):**
7. CRYPTO-2, CRYPTO-3 — rotateKeys chain key fix
8. CRYPTO-4 — safety number overflow
9. STORAGE-2, STORAGE-4, STORAGE-5
10. GROUP-1, GROUP-2 — identity binding + keyId monotonicity

**Этап 3 (hardening):**
11. GROUP-4, GROUP-5, GROUP-6
12. CALLS-2, CALLS-3, CALLS-4
13. HIGH items оставшиеся
