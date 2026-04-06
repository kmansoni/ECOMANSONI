---
name: webhook-patterns
description: "Паттерны webhook обработки: верификация подписи, идемпотентность, очередь, retry, мёртвые письма. Use when: webhook, входящий webhook, Stripe webhook, FCM callback, обработка событий, HMAC верификация."
argument-hint: "[источник: stripe | fcm | vk | custom | all]"
---

# Webhook Patterns — Безопасная обработка webhook

---

## Верификация подписи (HMAC)

```typescript
// supabase/functions/stripe-webhook/index.ts
Deno.serve(async (req) => {
  const signature = req.headers.get('Stripe-Signature');
  const body = await req.text(); // RAW body — важно для верификации!

  // НИКОГДА не пропускать верификацию
  const isValid = await verifyStripeSignature(body, signature);
  if (!isValid) {
    return new Response('Invalid signature', { status: 401 });
  }

  const event = JSON.parse(body);
  await processWebhookEvent(event);

  return new Response('OK', { status: 200 });
});

async function verifyStripeSignature(payload: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET not set');

  // Stripe использует HMAC-SHA256
  const [, timestamp, , hash] = signature.split(/[=,]/);
  const signedPayload = `${timestamp}.${payload}`;

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );
  const expectedSig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expectedHex = Array.from(new Uint8Array(expectedSig))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  return expectedHex === hash;
}
```

---

## Общий HMAC верификатор

```typescript
// supabase/functions/_shared/webhook-verify.ts
export async function verifyHmacSignature(
  payload: string,
  signature: string,
  secret: string,
  algorithm: 'SHA-256' | 'SHA-1' = 'SHA-256'
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const computed = Array.from(new Uint8Array(mac))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  // Constant-time comparison (предотвращает timing attacks)
  if (computed.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}
```

---

## Idempotent обработка

```sql
-- Таблица входящих webhook событий
CREATE TABLE webhook_events (
  id TEXT PRIMARY KEY,        -- event ID от провайдера (Stripe: evt_xxx)
  provider TEXT NOT NULL,     -- 'stripe', 'fcm', 'vk'
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Идемпотентная вставка
INSERT INTO webhook_events (id, provider, event_type, payload)
VALUES ($1, $2, $3, $4)
ON CONFLICT (id) DO NOTHING
RETURNING id;
-- Если RETURNING пустой — событие уже обработано, пропускаем
```

---

## Retry и Dead Letter Queue

```typescript
// Webhook обработчик с retry логикой
async function processWebhookEvent(event: WebhookEvent): Promise<void> {
  const MAX_RETRIES = 3;

  // Пометить как обрабатываемый
  await supabase.from('webhook_events').update({ processing: true }).eq('id', event.id);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await handleEvent(event);
      await supabase.from('webhook_events')
        .update({ processed_at: new Date().toISOString() })
        .eq('id', event.id);
      return;
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        // Dead Letter: переместить в очередь для ручной обработки
        await supabase.from('webhook_dead_letter').insert({
          event_id: event.id,
          error: String(err),
          attempts: MAX_RETRIES,
        });
        await supabase.from('webhook_events')
          .update({ error: String(err), processing: false })
          .eq('id', event.id);
      }
    }
  }
}
```

---

## Чеклист

- [ ] HMAC подпись верифицируется для каждого входящего webhook
- [ ] Raw body используется для верификации (не parsed JSON)
- [ ] Constant-time сравнение подписей
- [ ] Идемпотентность через event ID в БД
- [ ] Ответ 200 возвращается быстро (обработка асинхронно)
- [ ] Dead Letter Queue для необработанных событий
- [ ] Retry для транзиентных ошибок обработки
- [ ] Логирование всех входящих событий
