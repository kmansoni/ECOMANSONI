---
name: idempotency-patterns
description: "Идемпотентность операций: idempotency keys, дедупликация запросов, безопасный retry без дублей, PostgreSQL ON CONFLICT. Use when: идемпотентность, дублирующиеся запросы, double submit, повторные операции, ON CONFLICT."
argument-hint: "[операция: payment | message | notification | all]"
---

# Idempotency Patterns — Идемпотентность операций

Идемпотентная операция может быть выполнена многократно с тем же результатом что и единожды. Критично для: платежей, отправки сообщений, уведомлений.

---

## Idempotency Key паттерн

```typescript
// Client-side: генерация ключа на стороне клиента
function generateIdempotencyKey(operation: string, ...params: string[]): string {
  // Детерминированный ключ на основе контекста операции
  return `${operation}:${params.join(':')}:${Date.now()}`;
  // Для retry сохранять тот же ключ!
}

// Edge Function: проверка и выполнение
// supabase/functions/send-message/index.ts
Deno.serve(async (req) => {
  const idempotencyKey = req.headers.get('Idempotency-Key');
  const body = await req.json();

  if (!idempotencyKey) {
    return new Response('Missing Idempotency-Key header', { status: 400 });
  }

  // Проверить был ли этот запрос уже обработан
  const { data: existing } = await supabase
    .from('idempotency_cache')
    .select('response_body, response_status')
    .eq('key', idempotencyKey)
    .single();

  if (existing) {
    // Вернуть ранее сохранённый ответ
    return new Response(existing.response_body, {
      status: existing.response_status,
      headers: { 'X-Idempotency-Replayed': 'true' },
    });
  }

  // Выполнить операцию
  const result = await processMessage(body);
  const responseBody = JSON.stringify(result);

  // Сохранить ответ (TTL = 24 часа)
  await supabase.from('idempotency_cache').insert({
    key: idempotencyKey,
    response_body: responseBody,
    response_status: 200,
    expires_at: new Date(Date.now() + 86400_000).toISOString(),
  });

  return new Response(responseBody, { status: 200 });
});
```

---

## PostgreSQL ON CONFLICT

```sql
-- Таблица для idempotency кэша
CREATE TABLE idempotency_cache (
  key TEXT PRIMARY KEY,
  response_body TEXT NOT NULL,
  response_status INTEGER NOT NULL DEFAULT 200,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Автоматическая очистка устаревших записей
CREATE INDEX idx_idempotency_expires ON idempotency_cache(expires_at);

-- Безопасная вставка (ON CONFLICT DO NOTHING для дублей)
INSERT INTO messages (id, channel_id, sender_id, content, client_message_id)
VALUES (gen_random_uuid(), $1, $2, $3, $4)
ON CONFLICT (client_message_id) DO NOTHING
RETURNING id;

-- UNIQUE constraint для client_message_id
ALTER TABLE messages ADD CONSTRAINT messages_client_id_unique
  UNIQUE (client_message_id);
```

---

## Client-side дедупликация

```typescript
// В React: предотвратить double-click отправку
const pendingRef = useRef<Set<string>>(new Set());

async function sendMessage(text: string) {
  const msgKey = `msg:${channelId}:${text}:${Date.now()}`;

  if (pendingRef.current.has(msgKey)) return; // Уже в процессе
  pendingRef.current.add(msgKey);

  try {
    await api.sendMessage({ channelId, text, idempotencyKey: msgKey });
  } finally {
    pendingRef.current.delete(msgKey);
  }
}

// Кнопка отправки — disabled пока идёт запрос
<button
  onClick={() => sendMessage(text)}
  disabled={isPending}
>
  Отправить
</button>
```

---

## Retry с сохранённым ключом

```typescript
// ВАЖНО: при retry использовать тот же idempotency key!
async function sendWithRetry(payload: any, idempotencyKey: string) {
  return withRetry(
    () => fetch('/api/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey, // Одинаковый ключ!
      },
      body: JSON.stringify(payload),
    }),
    { maxAttempts: 3, baseDelayMs: 500 }
  );
}
```

---

## Чеклист

- [ ] Платёжные операции имеют idempotency key
- [ ] Edge Functions проверяют дубли через idempotency_cache
- [ ] `ON CONFLICT ... DO NOTHING` или `DO UPDATE` для уникальных вставок
- [ ] Client-side: кнопка disabled во время pending
- [ ] При retry — тот же idempotency key
- [ ] TTL для idempotency cache (очистка старых записей)
