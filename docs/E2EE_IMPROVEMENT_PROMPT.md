# E2EE Improvement Prompt: Достижение 10/10

Связанные документы:
- [docs/E2EE_EXECUTION_TRACKER.md](docs/E2EE_EXECUTION_TRACKER.md)
- [docs/E2EE_RELEASE_SIGNOFF_CHECKLIST.md](docs/E2EE_RELEASE_SIGNOFF_CHECKLIST.md)

---

## Текущее Состояние → Целевое

| Категория | Текущая | Целевая | Gap |
|-----------|---------|---------|---|
| Крипто-реализация | 9/10 | 10/10 | +1 |
| Управление ключами | 3/10 | 10/10 | +7 |
| Групповое E2EE | 4/10 | 10/10 | +6 |
| E2EE медиа | 5/10 | 10/10 | +5 |
| Готовность к продакшн | 4/10 | 10/10 | +6 |

---

## 20 Конкретных Задач (Backlog)

1. IndexedDB KeyStore вместо localStorage для всех E2EE-артефактов.
2. Миграция legacy-ключей из localStorage в безопасное хранилище.
3. WebAuthn/PRF binding для усиления локальной защиты ключей.
4. Key Ceremony для критических операций (rotation/export/delete).
5. Sender Keys для группового E2EE (Signal-style).
6. Group Key Tree для масштабирования больших групп (100+).
7. Membership Ratcheting при add/remove участников.
8. SFrame production implementation для audio/video потоков.
9. SFU key exchange без доступа SFU к plaintext.
10. Media key backup и восстановление на новом устройстве.
11. Server-side validation prekey/session без доступа к приватным ключам.
12. One-time prekey lifecycle enforcement (single-use + revoke).
13. Key Escrow (Social Recovery / Password-derived).
14. CI/CD security tests (crypto tests, static checks, dependency audit).
15. Incident Response Plan для key compromise/server breach.
16. Constant-time критичные сравнения (MAC/signature/hash).
17. Единый security logging policy без утечки key material.
18. Device transfer flow с безопасной re-enrollment процедурой.
19. PQ-readiness слой (hybrid KEM abstraction, feature-flag).
20. Формальный release-gate для E2EE (tests + checklist + sign-off).

---

# Фаза 1: Управление Ключами (3/10 → 10/10)

## Задача 1.1: Переход с localStorage на IndexedDB

**Контекст:** Текущее хранилище в localStorage уязвимо к XSS-атакам. Любой вредоносный скрипт может получить доступ ко всем ключам шифрования.

**Инструкция:**
```
Создай файл src/lib/crypto/keyStore.ts реализующий интерфейс KeyStore:

interface IdentityKeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey; // non-extractable
}

interface KeyStore {
  init(): Promise<void>;
  generateIdentityKeyPair(): Promise<IdentityKeyPair>;
  getIdentityKeyPair(): Promise<IdentityKeyPair | null>;
  storeMasterKey(userId: string, key: CryptoKey): Promise<void>;
  getMasterKey(userId: string): Promise<CryptoKey | null>;
  storeGroupKey(conversationId: string, keyVersion: number, key: CryptoKey): Promise<void>;
  getGroupKey(conversationId: string, keyVersion: number): Promise<CryptoKey | null>;
  deleteConversationKeys(conversationId: string): Promise<void>;
  wipe(): Promise<void>;
}

Требования:
- Используй IndexedDB (idb библиотека или нативный API)
- Все ключи с extractable: false
- Используй Web Crypto API для генерации
- Добавь автоматическую миграцию со старого localStorage
```

## Задача 1.2: WebAuthn/PRF для дополнительной защиты

**Контекст:** Для дополнительной безопасности привяжи ключи к аппаратному токену пользователя.

**Инструкция:**
```
Расширь src/lib/crypto/keyStore.ts:

Добавь метод для связывания ключей с WebAuthn:
- enableWebAuthnBinding(): Promise<void>
- deriveKeyFromWebAuthn(): Promise<CryptoKey>
- verifyWebAuthnCredential(): Promise<boolean>

При старте приложения:
1. Попробуй получить ключ из IndexedDB
2. Если есть WebAuthn привязка - запроси верификацию
3. Используй PRF (Pseudo-Random Function) для дополнительного entropy
4. Если WebAuthn недоступен - используй парольную фразу с PBKDF2

Используй:
- navigator.credentials.get() с PRF расширением
- PBKDF2 с 100,000+ итераций, SHA-256, уникальная соль
```

## Задача 1.3: Key Ceremony для критических операций

**Контекст:** Некоторые операции требуют дополнительной верификации (смена ключей, экспорт).

**Инструкция:**
```
Создай src/lib/crypto/keyCeremony.ts:

interface KeyCeremony {
  // Подтверждение критических операций
  confirmKeyRotation(): Promise<boolean>;
  confirmKeyExport(): Promise<boolean>;
  confirmAccountDeletion(): Promise<boolean>;
  
  // Методы подтверждения
  requestConfirmation(operation: 'rotate' | 'export' | 'delete'): Promise<void>;
  verifyConfirmation(code: string): Promise<boolean>;
}

Реализуй:
- Генерация 6-значного кода с expiration (5 минут)
- Отправка кода через альтернативный канал (email/2FA)
- Логирование попыток
- Блокировка после 3 неудачных попыток
```

---

# Фаза 2: Групповое E2EE (4/10 → 10/10)

## Задача 2.1: Sender Keys Distribution

**Контекст:** Текущая реализация не поддерживает распределение ключей в группах. Нужен Signal-подобный протокол Sender Keys.

**Инструкция:**
```
Создай src/lib/e2ee/senderKeys.ts:

interface SenderKeyState {
  conversationId: string;
  senderKeyId: string; // device-specific
  chainKey: CryptoKey;
  messageKey: CryptoKey;
  senderKeyPublic: string;
  senderKeyPrivate: string;
  version: number;
}

interface SenderKeyDistribution {
  // Генерация нового sender key
  generateSenderKey(conversationId: string): Promise<SenderKeyState>;
  
  // Распространение участникам группы
  distributeSenderKey(
    conversationId: string, 
    recipientIds: string[]
  ): Promise<SenderKeyMessage[]>;
  
  // Получение sender key от участника
  processSenderKeyMessage(message: SenderKeyMessage): Promise<void>;
  
  // Шифрование для группы
  encryptGroupMessage(
    conversationId: string, 
    plaintext: Uint8Array
  ): Promise<EncryptedGroupMessage>;
  
  // Расшифровка для группы  
  decryptGroupMessage(
    conversationId: string,
    message: EncryptedGroupMessage
  ): Promise<Uint8Array>;
}

Алгоритм (Signal Sender Keys):
1. Каждый участник генерирует sender key (chain)
2. Отправляет recipientKeyMessage каждому участнику
3. При отправке: encrypt(senderKey, plaintext)
4. При получении: decrypt(senderKey, ciphertext)

Используй:
- AES-256-GCM для шифрования
- HKDF-SHA-256 для derive chain key
- SenderKeyMessage сериализация в бинарный формат
```

## Задача 2.2: Group Key Tree (масштабирование)

**Контекст:** Для больших групп (100+ участников) нужна древовидная структура для эффективного шифрования.

**Инструкция:**
```
Расширь src/lib/e2ee/groupKeyTree.ts:

interface GroupKeyTree {
  // Построение дерева ключей для группы
  buildTree(participantIds: string[]): KeyTree;
  
  // Обновление дерева при изменении участников
  updateTree(added: string[], removed: string[]): KeyTree;
  
  // Эффективное шифрование для подмножества
  encryptForSubtree(
    nodeIds: string[], 
    plaintext: Uint8Array
  ): Promise<Map<string, Uint8Array>>;
}

Деревоsender key работает так:
          [Root Key]
         /    |    \
    [Branch] [Branch] [Branch]
      |         |        |
   [Leaf]    [Leaf]   [Leaf]
   User A    User B   User C

- Root key генерируется создателем
- Branch keys - промежуточные узлы
- Leaf keys - индивидуальные sender keys
- Сообщение шифруется один раз для branch
- Каждый branch дешифрует и ре-шифрует для своих leaves
```

## Задача 2.3: Group Membership Ratcheting

**Контекст:** При добавлении/удалении участников нужно обновлять ключи.

**Инструкция:**
```
Добавь в src/lib/e2ee/groupKeyTree.ts:

interface GroupMembershipChange {
  conversationId: string;
  changeType: 'add' | 'remove' | 'admin_promote' | 'admin_demote';
  affectedUserIds: string[];
  newSenderKey: SenderKeyState; // rotated
  prevKeyId: string;
  timestamp: number;
}

Протокол:
1. При добавлении участника:
   - Генерируй новый sender key для группы
   - Отправь old key + new key присоединённому
   - Все остальные используют new key

2. При удалении участника:
   - Генерируй полностью новый sender key
   - Удалённый не получает новый ключ
   - Все остальные переключаются на new key

3. При выходе участника:
   - Участник стирает свои ключи
   - Группа ротирует sender key
```

---

# Фаза 3: E2EE Медиа (5/10 → 10/10)

## Задача 3.1: SFrame Production Implementation

**Контекст:** SFrame (Secure Frame) - стандарт для E2EE звонков. Текущая реализация в процессе.

**Инструкция:**
```
Создай/улучши src/lib/e2ee/sframe.ts:

interface SFrameConfig {
  ssrc: number;
  epoch: number;
  keyId: number;
}

interface SFrameEncryptor {
  // Инициализация с shared secret
  init(sharedSecret: CryptoKey, keyId: number): Promise<void>;
  
  // Шифрование RTP/RTCP пакетов
  encryptRtp(payload: Uint8Array, header: SFrameConfig): Promise<Uint8Array>;
  
  // Расшифровка
  decrypt(ciphertext: Uint8Array): Promise<{payload: Uint8Array, header: SFrameConfig}>;
  
  // Ротация ключей (при смене участника)
  rotateKey(newKey: CryptoKey, newKeyId: number): Promise<void>;
}

Интеграция с WebRTC:
1. Получи shared secret из X3DH
2. Создай SFrameEncryptor для каждого участника
3. Используй Insertable Streams API для intercept RTP
4. Шифруй payload перед отправкой
5. Расшифруй при получении

Требования к реализации:
- AES-128-GCM или AES-256-GCM
- HKDF для derive per-stream keys
- SRTP ID как дополнительные данные (AD)
- Обработка rekeying при LONG_TERM_KEY_ROTATION
```

## Задача 3.2: End-to-End Encrypted Key Exchange для SFU

**Контекст:** SFU (Selective Forwarding Unit) должен получать только зашифрованные медиа, но участвовать в key exchange.

**Инструкция:**
```
Создай src/lib/e2ee/sfuKeyExchange.ts:

interface SFUKeyExchange {
  // Участник инициирует обмен
  participantJoin(
    participantId: string,
    ekg: E2EKeyGroup // публичные ключи участника
  ): Promise<E2EKeyGroupAck>;
  
  // SFU пересылает ключи участников
  forwardKeys(
    fromParticipantId: string,
    toParticipantId: string,
    ekg: E2EKeyGroup
  ): Promise<void>;
  
  // Участник подтверждает получение
  confirmKeys(participantId: string): Promise<void>;
  
  // Проверка целостности
  verifyParticipantKeys(participantId: string): Promise<boolean>;
}

Протокол E2EKG (E2E Key Group):
1. Участник A генерирует краткосрочную пару ключей
2. SFU получает публичный ключ, не может расшифровать
3. Участник B получает ключ от SFU
4. A и B устанавливают SFrame ключ напрямую
5. SFU пересылает зашифрованные данные

Важно: SFU не имеет доступа к plaintext медиа!
```

## Задача 3.3: Media Key Backup

**Контекст:** Пользователи должны иметь возможность восстановить ключи на новом устройстве для дешифровки старых медиа.

**Инструкция:**
```
Создай src/lib/e2ee/mediaKeyBackup.ts:

interface MediaKeyBackup {
  // Создание backup
  createBackup(
    mediaKeys: Map<string, CryptoKey>,
    userPassword: string
  ): Promise<EncryptedBackup>;
  
  // Восстановление из backup
  restoreBackup(
    backup: EncryptedBackup,
    userPassword: string
  ): Promise<Map<string, CryptoKey>>;
  
  // Обновление backup
  updateBackup(oldBackup: EncryptedBackup): Promise<EncryptedBackup>;
}

Спецификация backup:
{
  version: 1,
  salt: "base64...", // 32 bytes
  encryptedKeys: "base64...", // AES-256-GCM(userPassword + salt)
  keyIds: ["msg_1", "msg_5", ...], // индексированные ключи
  createdAt: timestamp,
  expiresAt: timestamp // опционально
}

Хранение:
- Шифрованный backup в облаке (Supabase Storage)
- Ключ - пользовательский пароль (PBKDF2 derived)
- Опционально: WebAuthn для подтверждения
```

---

# Фаза 4: Готовность к Продакшн (4/10 → 10/10)

## Задача 4.1: Server-Side Key Validation

**Контекст:** Сервер должен валидировать ключи без доступа к ним.

**Инструкция:**
```
Создай server/functions/validate-key-session/index.ts:

export default async function validateKeySession(req: Request) {
  // Валидация PreKeyBundle при первом контакте
  const { userId, preKeyBundle, clientPublicKey } = await req.json();
  
  // 1. Проверка формата ключей
  if (!isValidKeyFormat(preKeyBundle.identityKeyPublic)) {
    return error("INVALID_KEY_FORMAT");
  }
  
  // 2. Проверка подписи SPK
  const spkValid = await verifySignedPreKey(preKeyBundle);
  if (!spkValid) {
    return error("INVALID_SPK_SIGNATURE");
  }
  
  // 3. Проверка что OPK не использован
  if (preKeyBundle.oneTimePreKeyId) {
    const opkUsed = await checkOPKNotUsed(preKeyBundle.oneTimePreKeyId);
    if (opkUsed) {
      return error("OPK_ALREADY_USED");
    }
  }
  
  // 4. Проверка rate limiting
  const rateLimitOk = await checkRateLimit(userId, 'prekey');
  if (!rateLimitOk) {
    return error("RATE_LIMIT_EXCEEDED");
  }
  
  // 5. Логирование (без раскрытия ключей)
  await logKeyEvent({
    type: 'PREKEY_REQUEST',
    userId,
    hasOPK: !!preKeyBundle.oneTimePreKeyId,
    timestamp: Date.now()
  });
  
  return success({ valid: true });
}

Добавь Supabase Edge Function:
- Валидируй подпись SPK серверным публичным ключом
- Удаляй OPK из БД после использования (one-time)
- Rate limiting: max 10 prekey requests/minute
- Логируй анонимизированную статистику
```

## Задача 4.2: Key Escrow (опционально)

**Контекст:** Пользователи могут захотеть backup ключей для восстановления.

**Инструкция:**
```
Создай src/lib/e2ee/keyEscrow.ts:

interface KeyEscrow {
  // Создание escrow (с доверенным контактом или сервисом)
  createEscrow(trustedContactId?: string): Promise<EscrowPackage>;
  
  // Восстановление через escrow
  recoverFromEscrow(escrowPackage: EscrowPackage): Promise<CryptoKey>;
  
  // Обновление escrow при ротации
  updateEscrow(oldPackage: EscrowPackage): Promise<EscrowPackage>;
}

Модели escrow:

1. Social Recovery (рекомендуемая):
   - РазделиSecret на N частей (Shamir's Secret Sharing)
   - Доверенные контакты получают части
   - Для восстановления нужно M из N частей

2. Service Escrow (менее безопасно):
   - Зашифруй backup сертифицированным сервисом
   - Требует доверия к сервису

3. Password-derived (для параноиков):
   - Ключ никогда не покидает устройство
   - Восстановление только с паролем
```

## Задача 4.3: Security Audit Integration

**Контекст:** Автоматическая проверка безопасности в CI/CD.

**Инструкция:**
```
Добавь в .github/workflows/security.yml:

name: E2EE Security Tests
on: [push, pull_request]

jobs:
  crypto-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run E2EE Unit Tests
        run: npm run test -- src/test/e2ee-*.test.ts
        
      - name: Check for exposed secrets
        run: |
          npm install -g truffleHog
          truffleHog --directory ./src/lib/e2ee
          
      - name: Static Analysis
        run: |
          npm install -g eslint
          npx eslint src/lib/e2ee --ext .ts
          
      - name: Dependency Audit
        run: npm audit --audit-level=high
        
      - name: Cryptographic Review
        run: |
          # Проверка использования небезопасных алгоритмов
          grep -r "MD5\|SHA1\|DES\|RC4" src/lib/e2ee || echo "No weak crypto found"

  penetration-test:
    needs: crypto-tests
    runs-on: ubuntu-latest
    steps:
      - name: OWASP ZAP Scan
        uses: zaproxy/action-api-scan@v0.7.0
        with:
          target: 'https://your-api.example.com'
```

## Задача 4.4: Incident Response Plan

**Контекст:** Протокол действий при компрометации ключей.

**Инструкция:**
```
Создай docs/INCIDENT_RESPONSE_E2EE.md:

# E2EE Incident Response Plan

## Сценарий 1: Key Compromise Detected

### Признаки:
- Подозрительная активность в логах
- Пользователь сообщает о взломе
- Обнаружен вредоносный код в приложении

### Протокол:

1. НЕМЕДЛЕНО (0-5 минут):
   ```
   - Заблокировать скомпрометированные аккаунты
   - Отозвать все активные сессии
   - Включить enhanced logging
   ```

2. КОРОТКОСРОЧНО (5-30 минут):
   ```
   - Уведомить затронутых пользователей
   - Принудительная ротация ключей
   - Запустить forensic analysis
   ```

3. ДОЛГОСРОЧНО (30 минут - 24 часа):
   ```
   - Выпустить security advisory
   - Обновить клиенты
   - Провести full audit
   ```

## Сценарий 2: Server Breach

### Признаки:
- Неавторизованный доступ к серверам
- Утечка логов
- Аномальная активность

### Протокол:

1. НЕМЕДЛЕНО:
   ```
   - Изолировать скомпрометированные серверы
   - Ротация всех server-side keys
   - Сброс всех API credentials
   - Notification всех пользователей
   ```

## Контакты:
- Security Team: security@example.com
- Emergency: +7 XXX XXX XX XX
- Legal: legal@example.com
```

---

# Фаза 5: Улучшение Крипто-реализации (9/10 → 10/10)

## Задача 5.1: Constant-Time Operations

**Контекст:** Предотвращение timing attacks.

**Инструкция:**
```
Добавь в src/lib/e2ee/utils.ts:

// Constant-time comparison (не используй === для критичных данных)
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < maxLen; i++) {
    const av = i < a.length ? a[i] : 0;
    const bv = i < b.length ? b[i] : 0;
    diff |= av ^ bv;
  }
  return diff === 0;
}

// Constant-time selection
export function ctSelect(secret: Uint8Array, mask: Uint8Array): Uint8Array {
  const result = new Uint8Array(secret.length);
  for (let i = 0; i < secret.length; i++) {
    // Используй bitwise - нет branch prediction
    result[i] = secret[i] ^ (secret[i] ^ mask[i]);
  }
  return result;
}

// Проверь что все критичные операции используют timingSafeEqual:
- Сравнение подписей
- Сравнение MAC
- Сравнение хешей
- Сравнение nonce
```

## Задача 5.2: Post-Quantum Cryptography Prep

**Контекст:** Подготовка к эре квантовых компьютеров.

**Инструкция:**
```
Создай src/lib/e2ee/postquantum.ts:

// Гибридная схема: классический + post-quantum
// PQCKyber768 + ECDH P-256

interface HybridKeyExchange {
  // Генерация гибридной пары
  generateHybridKeyPair(): Promise<HybridKeyPair>;
  
  // Вычисление гибридного shared secret
  deriveHybridSecret(
    classicalPrivate: CryptoKey,
    pqPublic: Uint8Array
  ): Promise<Uint8Array>;
  
  // Классический + Kyber768 shared secret
  // Security level: AES-256 equivalent
}

// Пока не production - следи за NIST стандартами:
// - ML-KEM (Kyber) - key encapsulation
// - ML-DSA (Dilithium) - signatures
// - HSS/LMS - hash-based signatures

Следи за:
- NIST PQC Standardization Process
- Browser support для PQC
- Compatibility с существующими клиентами
```

---

# Проверка Прогресса

## Чеклист Достижения 10/10

```
□ Фаза 1: Управление Ключами
  □ 1.1 IndexedDB KeyStore
  □ 1.2 WebAuthn/PRF Binding  
  □ 1.3 Key Ceremony

□ Фаза 2: Групповое E2EE
  □ 2.1 Sender Keys Implementation
  □ 2.2 Group Key Tree
  □ 2.3 Membership Ratcheting

□ Фаза 3: E2EE Медиа
  □ 3.1 SFrame Production
  □ 3.2 SFU Key Exchange
  □ 3.3 Media Key Backup

□ Фаза 4: Готовность к Продакшн
  □ 4.1 Server-Side Validation
  □ 4.2 Key Escrow System
  □ 4.3 CI/CD Security Tests
  □ 4.4 Incident Response Plan

□ Фаза 5: Крипто-Улучшения
  □ 5.1 Constant-Time Operations
  □ 5.2 Post-Quantum Prep
```

---

# Notes

- После каждой задачи запускай npm run test
- Документируй все изменения в CHANGELOG.md
- Проверяй eslint перед commit
- Используй typed arrays для всех крипто-операций
- Никогда не логируй приватные ключи или plaintext

---

# Принципы Выполнения

- Все ключи создаются и хранятся с `extractable: false`.
- Для криптоопераций используются `Uint8Array`/`ArrayBuffer`, без строковых хаков.
- Приватные ключи, session secrets и plaintext никогда не попадают в логи.
- После каждой завершенной задачи запускаются профильные тесты и фиксируется результат.

---

# Sprint План (Week 1-8)

## Приоритеты

- `P0` — блокирует безопасность и production rollout.
- `P1` — критично для надежности и эксплуатационной готовности.
- `P2` — стратегические улучшения и future-proofing.

## Week 1-2: Security Foundation (`P0`)

Цель: закрыть главные риски компрометации ключей на клиенте.

Задачи:
- `P0` Task 1: IndexedDB KeyStore.
- `P0` Task 2: Миграция legacy-ключей из localStorage.
- `P0` Task 3: WebAuthn/PRF binding (fallback на passphrase + PBKDF2).
- `P1` Task 4: Key Ceremony (rotate/export/delete).

Definition of Done:
- Все ключи хранятся только через новый KeyStore.
- Нет runtime-обращений к localStorage для key material.
- Для критических операций требуется подтверждение.
- Тесты: unit + migration + negative tests проходят.

## Week 3-4: Group E2EE Core (`P0`)

Цель: довести групповое шифрование до рабочего и масштабируемого состояния.

Задачи:
- `P0` Task 5: Sender Keys.
- `P0` Task 7: Membership Ratcheting при add/remove.
- `P1` Task 6: Group Key Tree для больших групп.
- `P1` Task 12: OPK lifecycle enforcement (single-use + revoke).

Definition of Done:
- Сообщения в группе шифруются/расшифровываются через sender key flow.
- При изменении состава группы старые ключи не дают доступ к новым сообщениям.
- Ротация ключей работает без потери доставки.
- Тесты: group join/leave/replay/out-of-order проходят.

## Week 5-6: Media E2EE (`P0`)

Цель: production-ready медиа-шифрование в звонках.

Задачи:
- `P0` Task 8: SFrame production implementation.
- `P0` Task 9: SFU key exchange без доступа к plaintext.
- `P1` Task 10: Media key backup.
- `P1` Task 18: Device transfer re-enrollment flow.

Definition of Done:
- RTP payload всегда зашифрован end-to-end до SFU.
- SFU не может восстановить медиаключи или plaintext.
- При смене устройства ключи/доступ восстанавливаются по регламенту.
- Тесты: media encrypt/decrypt/rekey/failure recovery проходят.

## Week 7: Production Hardening (`P0/P1`)

Цель: встроить security-контроль в сервер и pipeline.

Задачи:
- `P0` Task 11: Server-side validation prekey/session.
- `P1` Task 14: CI/CD security tests.
- `P1` Task 15: Incident response plan.
- `P1` Task 17: Security logging policy.

Definition of Done:
- Сервер отклоняет невалидные prekey/session запросы.
- Security checks обязательны в PR/push pipeline.
- Есть формальный runbook на инциденты.
- Логи безопасны и не содержат секретов.

## Week 8: Finalization & Future-Proof (`P1/P2`)

Цель: завершить эксплуатационную готовность и стратегические улучшения.

Задачи:
- `P1` Task 13: Key Escrow (с явной моделью trust).
- `P2` Task 19: PQ-readiness abstraction.
- `P2` Task 16: Constant-time review и remediation.
- `P1` Task 20: Final E2EE release-gate и sign-off.

Definition of Done:
- Выбрана и задокументирована escrow-модель.
- PQ-слой отключаем/включаем через feature flag.
- Проведен финальный crypto review критичных операций.
- Release-gate выполнен, есть формальный security sign-off.

---

# Зависимости Между Задачами

- Task 1 → блокирует Tasks 3, 10, 13, 18.
- Task 5 → блокирует Tasks 7, 6.
- Tasks 8 и 9 должны идти совместно (один media контур).
- Task 11 должен быть готов до финального release-gate (Task 20).
- Tasks 14 и 15 обязательны перед production rollout.

---

# Definition of Done (Глобальный)

- Все `P0` задачи закрыты и покрыты тестами.
- Full test suite проходит стабильно в CI.
- Нет хранения key material в небезопасных сторах.
- Есть документированные процедуры incident response и key recovery.
- Security review подтверждает отсутствие критичных блокеров.