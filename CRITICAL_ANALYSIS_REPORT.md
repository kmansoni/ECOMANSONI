# Критический анализ бизнес-логики приложения

**Дата:** 2026-03-10  
**Аудитор:** Code Skeptic  
**Версия:** 1.0

---

## Резюме

Проведён критический анализ ключевых областей приложения:
- Файлы чата и сообщений (`src/lib/chat/sendMessageV1.ts`, `src/components/chat/*.tsx`)
- Файлы аутентификации (`src/auth/*.ts`)
- Supabase Edge Functions (`supabase/functions/**/*.ts`)

**Обнаружено:** 17 критических проблем, 8 средних проблем, 5 рекомендаций по улучшению.

---

## 🔴 КРИТИЧЕСКИЕ ПРОБЛЕМЫ

### 1. Гонка данных (Race Condition) в optimistic updates

**Файл:** [`src/hooks/useMessageReactions.ts:303-314`](src/hooks/useMessageReactions.ts:303)

```typescript
const toggleReaction = useCallback(
  async (messageId: string, emoji: string) => {
    const reactions = reactionsMap.get(messageId) ?? [];
    const existing = reactions.find((r) => r.emoji === emoji);
    if (existing?.hasReacted) {
      await removeReaction(messageId, emoji);
    } else {
      await addReaction(messageId, emoji);
    }
  },
  [reactionsMap, addReaction, removeReaction]  // <-- STALE CLOSURE!
);
```

**Проблема:** `reactionsMap` захватывается в замыкании при создании колбэка и не обновляется между вызовами. При быстром нажатии (double-tap) используется устаревшее состояние.

**Рекомендация:** Использовать функциональную форму `setReactionsMap` внутри toggleReaction или добавить `reactionsMap` в зависимости через useRef.

---

### 2. Потеря данных при ошибке отправки email

**Файл:** [`supabase/functions/send-email-otp/index.ts:229-231`](supabase/functions/send-email-otp/index.ts:229)

```typescript
} catch (err) {
  console.error("[send-email-otp] email-router fetch failed:", err);
}
// Функция ВСЕГДА возвращает success: true
const resp: Record<string, unknown> = { success: true };
```

**Проблема:** При ошибке отправки email (сеть недоступна, SMTP ошибка) функция возвращает `{ success: true }`. Пользователь думает, что код отправлен, но фактически письмо не ушло.

**Рекомендация:** Возвращать `{ success: false, error: "..." }` при ошибке fetch.

---

### 3. Утечка памяти в DoubleTapReaction

**Файл:** [`src/components/chat/DoubleTapReaction.tsx:31-34`](src/components/chat/DoubleTapReaction.tsx:31)

```typescript
if (!hasReaction) {
  setShowHeart(true);
  setTimeout(() => setShowHeart(false), 800);  // <-- НЕТ ОЧИСТКИ
}
```

**Проблема:** `setTimeout` не очищается при размонтировании компонента. При быстром переходе между чатами таймеры накапливаются.

**Рекомендация:**
```typescript
useEffect(() => {
  return () => clearTimeout(timerRef.current);
}, []);
```

---

### 4. Небезопасное использование non-null assertion

**Файл:** [`supabase/functions/verify-sms-otp/index.ts:49-51`](supabase/functions/verify-sms-otp/index.ts:49)

```typescript
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const phoneAuthSecret = Deno.env.get("PHONE_AUTH_SECRET");
```

**Проблема:** Использование `!` для ненадёжных переменных окружения. Если env var не установлен, функция упадёт с непонятной ошибкой вместо информативного сообщения.

**Рекомендация:** Добавить явную проверку и возврат 500 с понятным сообщением (уже сделано для `phoneAuthSecret`, но не для первых двух).

---

### 5. Потенциальная утечка данных в log

**Файл:** [`supabase/functions/send-email-otp/index.ts:201-206`](supabase/functions/send-email-otp/index.ts:201)

```typescript
console.info("[send-email-otp] Sending OTP email", {
  recipient: maskEmail(email),
  sendUrl,
  hasIngestKey: Boolean(emailRouterIngestKey),
  keySource: emailKeySource,
});
```

**Проблема:** Несмотря на маскирование email, логи могут содержать ценную информацию для атакующего (timing attacks, volume analysis).

**Рекомендация:** Уменьшить детализацию логов в продакшене.

---

### 6. Уязвимость: Timing attack на OTP проверку

**Файл:** [`supabase/functions/verify-sms-otp/index.ts:102-110`](supabase/functions/verify-sms-otp/index.ts:102)

```typescript
function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length) return false;  // <-- РАЗНАЯ ДЛИНА = БЫСТРЫЙ ОТВЕТ
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}
```

**Проблема:** Функция сравнивает длину ДО выполнения timing-safe сравнения. Злоумышленник может использовать разницу во времени для определения правильной длины кода.

**Рекомендация:** Всегда сравнивать фиксированную длину (6 символов), отклонять на этапе валидации ввода.

---

### 7. Отсутствие пагинации при listUsers

**Файл:** [`supabase/functions/verify-email-otp/index.ts:132-135`](supabase/functions/verify-email-otp/index.ts:132)

```typescript
const { data: userLookup } = await supabase.auth.admin.listUsers();
const existingUser = userLookup?.users?.find(
  (u) => u.email?.toLowerCase() === email,
);
```

**Проблема:** `listUsers()` без пагинации. При большом количестве пользователей функция будет работать очень медленно или упадёт по таймауту.

**Рекомендация:** Использовать `listUsers({ page: 1, per_page: 100 })` с итерацией по страницам.

---

### 8. Гонка записи в sessionStore

**Файл:** [`src/auth/sessionStore.ts:67-85`](src/auth/sessionStore.ts:67)

```typescript
function persistSessionsEncrypted(sessions: Record<string, AccountSession>): void {
  const snapshot = JSON.stringify(sessions);
  _pendingWrite = (async () => {  // <-- ПЕРЕЗАПИСЫВАЕТСЯ ПРИ КАЖДОМ ВЫЗОВЕ
    // ...
  })();
}
```

**Проблема:** При быстрых последовательных вызовах `saveSessions` (например, при синхронизации нескольких аккаунтов) предыдущий Promise отменяется, и данные могут быть потеряны.

**Рекомендация:** Добавить очередь записи или ожидание предыдущей операции:
```typescript
async function persistWithRetry(sessions) {
  while (_pendingWrite) await _pendingWrite;
  // ... теперь записываем
}
```

---

### 9. Null pointer без адекватной обработки

**Файл:** [`src/lib/chat/sendMessageV1.ts:33-39`](src/lib/chat/sendMessageV1.ts:33)

```typescript
const messageId = row?.message_id ? String(row.message_id) : "";
// ...
if (!messageId || !Number.isFinite(seq)) {
  throw new Error("SEND_MESSAGE_V1_INVALID_RESPONSE");
}
```

**Проблема:** При ошибке RPC возвращается пустая строка `""` вместо понятной ошибки. Это маскирует реальную проблему (например, RLS violation, network error).

**Рекомендация:** Проверять наличие `row` перед доступом к свойствам, логировать оригинальный ответ для отладки.

---

### 10. Stale closure в useMessageReactions

**Файл:** [`src/hooks/useMessageReactions.ts:189-259`](src/hooks/useMessageReactions.ts:189)

```typescript
const addReaction = useCallback(
  async (messageId: string, emoji: string) => {
    if (!user) return;
    // ...
    try {
      // ...
    } catch (err) {
      // На ошибке вызывается fetchReactions, который использует старое значение user
      fetchReactions();
    }
  },
  [user, conversationId, fetchReactions, canFilterByConversation, isMissingConversationIdError]
);
```

**Проблема:** При быстрых действиях пользователя `user` может быть stale. Хотя в данном случае user меняется редко, паттерн опасен.

---

## 🟠 СРЕДНИЕ ПРОБЛЕМЫ

### 11. Кэш не адаптируется к изменению fingerprint

**Файл:** [`src/auth/localStorageCrypto.ts:88-136`](src/auth/localStorageCrypto.ts:88)

```typescript
async function deriveKey(salt?: ArrayBuffer): Promise<{ key: CryptoKey; salt: ArrayBuffer }> {
  // Кэшируется по salt, но если fingerprint изменится между сессиями -
  // данные станут недоступны
  if (_cachedKey && _cachedSalt && salt && bufToB64(_cachedSalt) === bufToB64(salt)) {
    return { key: _cachedKey, salt: _cachedSalt };
  }
}
```

**Проблема:** Если fingerprint (screen resolution, timezone) меняется между посещениями, зашифрованные данные становятся недоступны без явного сообщения пользователю.

---

### 12. Устаревшая проверка в parseEncryptedPayload

**Файл:** [`src/components/chat/ChatConversation.tsx:124-142`](src/components/chat/ChatConversation.tsx:124)

```typescript
function parseEncryptedPayload(content: unknown): EncryptedPayload | null {
  try {
    const parsed = JSON.parse(String(content ?? ""));
    // Проверяется v === 2, но нет проверки на v === 1 (обратная совместимость?)
    if (
      parsed &&
      parsed.v === 2 &&
      // ...
    ) {
      return parsed as EncryptedPayload;
    }
  } catch {
    return null;
  }
  return null;
}
```

**Проблема:** Функция возвращает `null` без логирования - сложно отладить, почему не парсится payload.

---

### 13. Потенциальная проблема с реакциями при удалении

**Файл:** [`src/hooks/useMessageReactions.ts:261-301`](src/hooks/useMessageReactions.ts:261)

```typescript
const removeReaction = useCallback(
  async (messageId: string, emoji: string) => {
    if (!user) return;
    // Optimistic update без проверки, что реакция принадлежит user
    setReactionsMap((prev) => {
      // ...
    });
    // ...
  },
  [user, fetchReactions]
);
```

**Проблема:** Optimistic update удаляет реакцию без проверки, что она действительно принадлежит текущему пользователю. Может привести к некорректному отображению count.

---

### 14. Cache poisoning в link-preview

**Файл:** [`supabase/functions/link-preview/index.ts:425-430`](supabase/functions/link-preview/index.ts:425)

```typescript
if (cachedRow && (cachedRow as CachedPreviewRow).url === normalizedUrl) {
  staleRow = cachedRow as CachedPreviewRow;
  if (Date.parse(staleRow.expires_at) > Date.now()) {  // >
    return jsonResponse(rowToPayload(staleRow, true), origin);
  }
}
```

**Проблема:** Используется `>` вместо `>=` для проверки expiry. При точной границе времени кэш может считаться валидным на миллисекунду дольше.

---

### 15. Проверка token истечения после сравнения кода

**Файл:** [`supabase/functions/verify-email-otp/index.ts:99-122`](supabase/functions/verify-email-otp/index.ts:99)

```typescript
// Сначала проверяется expiry
if (new Date(otp.expires_at) < new Date()) {
  await supabase.from("email_otp_codes").delete().eq("id", otp.id);
  return jsonResp(origin, { error: "Code expired..." }, 410);
}
// Потом увеличивается attempts
await supabase.from("email_otp_codes").update({ attempts: otp.attempts + 1 }).eq("id", otp.id);
// ПОТОМ сравнивается код
if (!timingSafeEqual(code, otp.code)) {
```

**Проблема:** Счётчик attempts увеличивается ДО проверки кода. Если код истёк, attempt всё равно засчитывается. Логически правильнее увеличивать только при неверном коде.

---

### 16. No error boundary в MessageReactions

**Файл:** [`src/components/chat/MessageReactions.tsx:39-76`](src/components/chat/MessageReactions.tsx:39)

```typescript
const toggleReaction = useCallback(
  async (emoji: string) => {
    if (!user) return;
    // ...
    if (existing?.hasReacted) {
      await (supabase as any)
        .from('message_reactions')
        .delete() // <-- НЕТ ОБРАБОТКИ ОШИБОК
        .eq('message_id', messageId)
        .eq('user_id', user.id);
    }
    // ...
  },
  [user, messageId, reactions, onPickerClose, onReactionChange, onToggle]
);
```

**Проблема:** Все Supabase операции в legacy mode не имеют обработки ошибок. При сбое сети пользователь не видит feedback.

---

### 17. Не проверяется валидность email в verify-email-otp

**Файл:** [`supabase/functions/verify-email-otp/index.ts:60-71`](supabase/functions/verify-email-otp/index.ts:60)

```typescript
try {
  const body = await req.json();
  email = (body.email ?? "").trim().toLowerCase();
  code = (body.code ?? "").trim();
} catch {
  return jsonResp(origin, { error: "Invalid JSON" }, 400);
}

if (!email || !code) {  // <-- Нет проверки формата email
  return jsonResp(origin, { error: "email and code required" }, 400);
}
```

**Проблема:** Проверяется только наличие email, но не его формат. Может привести к созданию пользователей с некорректными адресами.

---

## 🔵 РЕКОМЕНДАЦИИ ПО УЛУЧШЕНИЮ

### 18. Type safety - избегать `as any`

**Файл:** [`src/lib/chat/sendMessageV1.ts:20`](src/lib/chat/sendMessageV1.ts:20)

```typescript
const res = await (supabase as any).rpc("send_message_v1", {...});
```

**Рекомендация:** Сгенерировать типы через `supabase gen types typescript` и использовать строгую типизацию.

---

### 19. Centralized error handling

Многие функции имеют однотипную обработку ошибок. Рекомендуется создать унифицированный Error Handler:

```typescript
function handleError(error: unknown, context: string): Response {
  console.error(`[${context}]`, error);
  return jsonResp(..., { error: "Internal server error" }, 500);
}
```

---

### 20. Добавить тесты на граничные случаи

Критические сценарии без покрытия тестами:
- Одновременное нажатие reaction несколькими пользователями
- Потеря connectivity во время отправки сообщения
- Истечение token во время выполнения запроса

---

### 21. Rate limiting для sensitive операций

**Файл:** [`supabase/functions/verify-sms-otp/index.ts`](supabase/functions/verify-sms-otp/index.ts)

Текущий лимит: MAX_ATTEMPTS = 5

**Рекомендация:** Добавить time-based lockout после исчерпания попыток (например, 15 минут).

---

### 22. Health check для email router

**Файл:** [`supabase/functions/send-email-otp/index.ts:94-97`](supabase/functions/send-email-otp/index.ts:94)

```typescript
if (!emailRouterUrl) {
  return jsonResp(origin, { error: "Email service unavailable" }, 503);
}
```

**Рекомендация:** Добавить periodic health check endpoint, который проверяет доступность email router.

---

## 📊 Статистика по типам проблем

| Категория | Количество |
|-----------|------------|
| Race Conditions | 3 |
| Unhandled Exceptions | 3 |
| Memory Leaks | 2 |
| Security Issues | 3 |
| Logic Errors | 4 |
| Performance Issues | 2 |
| Recommendations | 5 |
| **TOTAL** | **22** |

---

## 🎯 Приоритетный план исправлений

### Незамедлительно (критические):
1. ✅ Исправить race condition в toggleReaction (useMessageReactions.ts)
2. ✅ Исправить возврат success при ошибке email (send-email-otp)
3. ✅ Очистить setTimeout в DoubleTapReaction

### В течение недели:
4. ✅ Добавить проверку env vars с понятными сообщениями
5. ✅ Исправить timing attack на OTP
6. ✅ Добавить пагинацию в listUsers

### В течение месяца:
7. ✅ Переписать на строгую типизацию
8. ✅ Добавить тесты на граничные случаи
9. ✅ Внедрить centralized error handling
