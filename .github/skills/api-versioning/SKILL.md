---
name: api-versioning
description: "Версионирование API Edge Functions: URL versioning, header versioning, backward compatibility, миграции без breaking changes. Use when: версионирование API, breaking change, v1/v2 endpoint, backward compatibility, Edge Function версии."
argument-hint: "[функция или API для версионирования]"
---

# API Versioning — Версионирование API

---

## URL Versioning для Edge Functions

```typescript
// Структура: supabase/functions/api/index.ts (unified router)
// Маршруты: /api/v1/messages, /api/v2/messages

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // ['api', 'v1', 'messages'] или ['api', 'v2', 'messages']

  const version = pathParts[1]; // 'v1' или 'v2'
  const resource = pathParts[2]; // 'messages'

  switch (`${version}/${resource}`) {
    case 'v1/messages':
      return handleMessagesV1(req);
    case 'v2/messages':
      return handleMessagesV2(req);
    default:
      return new Response('Not Found', { status: 404 });
  }
});
```

---

## Отдельные функции по версиям

```
supabase/functions/
  send-message/        → текущая стабильная версия
  send-message-v2/     → новая версия с breaking changes
```

```typescript
// send-message-v2/index.ts — новый формат ответа
Deno.serve(async (req) => {
  // V2: возвращает {data: {...}, meta: {...}} вместо плоского объекта
  const message = await createMessage(req);
  return Response.json({
    data: message,
    meta: { version: 'v2', timestamp: Date.now() },
  });
});
```

---

## Header Versioning

```typescript
// Клиент указывает версию через header
const response = await supabase.functions.invoke('send-message', {
  body: payload,
  headers: { 'X-API-Version': '2' },
});

// Edge Function
Deno.serve(async (req) => {
  const version = req.headers.get('X-API-Version') ?? '1';

  if (version === '2') return handleV2(req);
  return handleV1(req);
});
```

---

## Backward Compatibility — правила

```typescript
// ✅ Non-breaking changes — можно без нового версии:
// - Добавить новое поле в response
// - Сделать существующий параметр опциональным
// - Добавить новый endpoint

// ❌ Breaking changes — ТРЕБУЮТ новую версию:
// - Удалить/переименовать поле в response
// - Изменить тип поля
// - Сделать опциональный параметр обязательным
// - Изменить семантику существующего поля

// Пример: добавить поле без breaking change
// V1 response: { id, content, sender_id }
// V2 response: { id, content, sender_id, reactions: [] } ← OK
// V2 response: { id, text, senderId } ← BREAKING (renamed fields)
```

---

## Deprecation Header

```typescript
// Предупреждать клиентов о deprecated версии
function addDeprecationHeader(response: Response, sunsetDate: string): Response {
  const headers = new Headers(response.headers);
  headers.set('Deprecation', 'true');
  headers.set('Sunset', sunsetDate); // RFC format
  headers.set('Link', '</api/v2/messages>; rel="successor-version"');
  return new Response(response.body, { status: response.status, headers });
}

// V1 помечена как deprecated, будет удалена 2026-12-01
return addDeprecationHeader(v1Response, 'Tue, 01 Dec 2026 00:00:00 GMT');
```

---

## Чеклист

- [ ] Breaking changes всегда требуют новой версии API
- [ ] Старые версии работают параллельно с новыми (минимум 6 месяцев)
- [ ] Deprecation headers у устаревших эндпоинтов
- [ ] Changelog документирует изменения между версиями
- [ ] Клиентский код указывает версию явно (не полагается на default)
