# API Rate Limiter

## Описание

Rate limiting для API: алгоритмы, per-user/per-endpoint лимиты, реализация в Edge Functions и PostgreSQL.

## Когда использовать

- Публичные API — защита от abuse
- Аутентификация — brute force protection
- AI-эндпоинты — ограничение дорогих запросов
- File upload — контроль трафика
- Любой эндпоинт с внешним доступом

## Алгоритмы

### Token Bucket (рекомендуется)

Накапливает токены с фиксированной скоростью. Позволяет burst.

```sql
CREATE TABLE rate_limits (
  key text PRIMARY KEY,          -- 'user:123:api' или 'ip:1.2.3.4:login'
  tokens numeric NOT NULL,
  max_tokens numeric NOT NULL,
  refill_rate numeric NOT NULL,  -- токенов/секунду
  last_refill timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key text,
  p_max_tokens numeric DEFAULT 60,
  p_refill_rate numeric DEFAULT 1,  -- 1 токен/сек = 60/мин
  p_cost numeric DEFAULT 1
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  rec rate_limits%ROWTYPE;
  elapsed numeric;
  new_tokens numeric;
BEGIN
  SELECT * INTO rec FROM rate_limits WHERE key = p_key FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO rate_limits (key, tokens, max_tokens, refill_rate)
    VALUES (p_key, p_max_tokens - p_cost, p_max_tokens, p_refill_rate);
    RETURN true;
  END IF;

  elapsed := EXTRACT(EPOCH FROM (now() - rec.last_refill));
  new_tokens := LEAST(rec.max_tokens, rec.tokens + elapsed * rec.refill_rate);

  IF new_tokens >= p_cost THEN
    UPDATE rate_limits
    SET tokens = new_tokens - p_cost, last_refill = now()
    WHERE key = p_key;
    RETURN true;
  END IF;

  UPDATE rate_limits SET last_refill = now(), tokens = new_tokens WHERE key = p_key;
  RETURN false;
END;
$$;
```

### Sliding Window (точный, для логов)

```sql
CREATE TABLE request_log (
  id bigserial PRIMARY KEY,
  key text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_request_log ON request_log (key, created_at);

CREATE OR REPLACE FUNCTION check_sliding_window(
  p_key text,
  p_limit int DEFAULT 100,
  p_window interval DEFAULT '1 minute'
)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  req_count int;
BEGIN
  SELECT count(*) INTO req_count
  FROM request_log
  WHERE key = p_key AND created_at > now() - p_window;

  IF req_count >= p_limit THEN
    RETURN false;
  END IF;

  INSERT INTO request_log (key) VALUES (p_key);
  RETURN true;
END;
$$;
```

## Edge Function middleware

```typescript
async function rateLimitMiddleware(req: Request, key: string): Promise<Response | null> {
  const { data, error } = await supabaseAdmin
    .rpc('check_rate_limit', { p_key: key, p_max_tokens: 30, p_refill_rate: 0.5 });

  if (error || !data) {
    return new Response(JSON.stringify({ error: 'Too Many Requests' }), {
      status: 429,
      headers: {
        'Retry-After': '60',
        'X-RateLimit-Limit': '30',
        'Content-Type': 'application/json',
      },
    });
  }
  return null; // OK, продолжаем
}

// Использование
serve(async (req) => {
  const userId = getUserId(req);
  const limited = await rateLimitMiddleware(req, `user:${userId}:chat`);
  if (limited) return limited;
  // ... обработка
});
```

## Лимиты по уровням

| Эндпоинт | Anon | Auth | Pro |
|----------|------|------|-----|
| Общий API | 30/мин | 120/мин | 600/мин |
| Login | 5/мин | - | - |
| AI Chat | - | 20/час | 100/час |
| File Upload | - | 10/час | 50/час |

## Чеклист

1. **Ключ** — `user_id + endpoint`, не только IP (NAT = общий IP)
2. **429 + Retry-After** — стандартный HTTP ответ
3. **Headers** — `X-RateLimit-Limit`, `X-RateLimit-Remaining`
4. **Cleanup** — удалять старые записи из `request_log` по cron
5. **Burst** — token bucket допускает burst, sliding window — нет
6. **Разные лимиты** — дорогие эндпоинты (AI, upload) строже

## Anti-patterns

- Rate limit только по IP — все за NAT блокируются
- Нет 429 ответа — клиент не знает что заблокирован
- In-memory counter в Edge Function — каждый invocation отдельный
- Одинаковый лимит для всех эндпоинтов — AI стоит дороже
- Нет cleanup — таблица `request_log` растёт бесконечно
- Rate limit после обработки — ресурсы уже потрачены
