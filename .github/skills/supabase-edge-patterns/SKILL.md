---
name: supabase-edge-patterns
description: "Паттерны Supabase Edge Functions на Deno: CORS, авторизация, валидация, rate limiting, error handling, secrets, деплой. Use when: создание Edge Function, отладка CORS, авторизация в функции, обработка webhook, Deno.serve."
argument-hint: "[описание Edge Function]"
user-invocable: true
---

# Supabase Edge Patterns — Паттерны Edge Functions

Производственные паттерны для Supabase Edge Functions на Deno. Всё что нужно знать о CORS, авторизации, валидации и безопасных деплоях.

## Базовый шаблон Edge Function

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('FRONTEND_URL') ?? 'http://localhost:8080',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

Deno.serve(async (req) => {
  // 1. CORS preflight — ВСЕГДА первым
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // 2. Авторизация — ВСЕГДА проверять
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    // 3. Получить пользователя
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 4. Валидация входных данных
    const { param } = await req.json()
    if (!param || typeof param !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid param' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 5. Бизнес-логика
    const result = await doSomething(supabase, user.id, param)

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    // 6. Error handling — НЕ раскрывать внутренние детали
    console.error('Edge function error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
```

## CORS — Конфигурация

### Development (localhost разрешён)

```typescript
// supabase/functions/_shared/cors.ts
const DEV_ORIGINS = ['http://localhost:8080', 'http://localhost:5173', 'http://localhost:3000']
const PROD_ORIGIN = Deno.env.get('FRONTEND_URL') ?? ''

export function getCorsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get('Origin') ?? ''
  const isDev = Deno.env.get('SUPABASE_ENV') === 'development' || DEV_ORIGINS.includes(origin)
  const allowedOrigin = isDev ? origin : PROD_ORIGIN

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  }
}
```

**Важно:** НИКОГДА не ставить `*` для endpoint с авторизацией.

## Авторизация — Паттерны

### Паттерн 1: User-context (для запросов от клиента)

```typescript
// Передаёт JWT пользователя — RLS работает автоматически
const supabase = createClient(url, anonKey, {
  global: { headers: { Authorization: req.headers.get('Authorization')! } }
})
```

### Паттерн 2: Service-context (для системных операций)

```typescript
// Обходит RLS — использовать только для trusted server-side операций
const adminSupabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)
// ⚠️ ТОЛЬКО для webhooks, cron jobs, notification delivery
// НИКОГДА не передавать service_role ключ клиенту
```

### Паттерн 3: Webhook авторизация (Stripe, VK, etc.)

```typescript
async function verifyWebhookSignature(req: Request, secret: string): Promise<boolean> {
  const signature = req.headers.get('x-signature') ?? ''
  const body = await req.text()
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const sigBytes = hexToBytes(signature.replace('sha256=', ''))
  return await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(body))
}
```

## Валидация входных данных

```typescript
// Типизированная валидация без внешних зависимостей
interface CreateMessageInput {
  channelId: string
  content: string
}

function validateInput(body: unknown): CreateMessageInput {
  if (!body || typeof body !== 'object') throw new Error('Invalid body')
  const { channelId, content } = body as Record<string, unknown>
  if (!channelId || typeof channelId !== 'string' || channelId.length > 36) {
    throw new Error('Invalid channelId')
  }
  if (!content || typeof content !== 'string' || content.length > 4096) {
    throw new Error('Invalid content')
  }
  return { channelId, content }
}
```

## Rate Limiting (через Redis / KV или Supabase)

```typescript
async function checkRateLimit(supabase: SupabaseClient, userId: string, action: string, limitPerMinute: number): Promise<boolean> {
  const window = Math.floor(Date.now() / 60000) // 1-минутное окно
  const key = `rate:${action}:${userId}:${window}`

  const { data } = await supabase.rpc('increment_rate_limit', { key_param: key, limit_param: limitPerMinute })
  return data === true // true = allowed, false = rate limited
}
```

## Secrets Management

```typescript
// Правильно: из env
const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
if (!stripeKey) throw new Error('STRIPE_SECRET_KEY not configured')

// Установка секретов:
// supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx --project-ref lfkbgnbjxskspsownvjm
```

**Список env vars проекта:**
- `SUPABASE_URL` — автоматически
- `SUPABASE_ANON_KEY` — автоматически
- `SUPABASE_SERVICE_ROLE_KEY` — только для system functions
- `FRONTEND_URL` — для CORS
- `ANTHROPIC_API_KEY` — для AI функций
- `STRIPE_SECRET_KEY` — для платежей

## Структура проекта

```
supabase/functions/
├── _shared/
│   ├── cors.ts          ← Shared CORS headers
│   ├── auth.ts          ← Auth helpers
│   └── validation.ts    ← Input validators
├── send-message/
│   └── index.ts
├── process-payment/
│   └── index.ts
└── ai-completion/
    └── index.ts
```

## Деплой

```bash
# Один функция
supabase functions deploy function-name --project-ref lfkbgnbjxskspsownvjm

# Все функции
supabase functions deploy --project-ref lfkbgnbjxskspsownvjm

# Проверить логи
supabase functions logs function-name --project-ref lfkbgnbjxskspsownvjm
```

## Checklist перед деплоем

- [ ] CORS headers присутствуют на ВСЕХ ответах
- [ ] OPTIONS preflight возвращает 200
- [ ] Authorization заголовок проверяется (нет анонимного доступа)
- [ ] Input validation — все параметры проверены
- [ ] Нет stack trace в error response
- [ ] Secrets взяты из env, не хардкожены
- [ ] `console.error` для всех catch блоков (логи видны в dashboard)
- [ ] Нет `_shared/` файлов без использования

## Ловушки (из /memories/repo/)

- `CONCURRENTLY` в SQL внутри функции → убрать, Deno транзакция не поддерживает
- `import` из npm без `esm.sh` → не работает в Deno
- `fetch()` без timeout → может зависнуть навсегда
- CORS wildcard `*` с `credentials: true` → браузер блокирует
