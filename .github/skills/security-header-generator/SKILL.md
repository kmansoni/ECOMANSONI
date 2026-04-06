---
name: security-header-generator
description: "Генератор security headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. Настройка для React SPA и Supabase Edge Functions. Use when: security headers, CSP policy, настройка заголовков безопасности, HSTS, X-Frame."
argument-hint: "[контекст: spa | edge-function | nginx | both]"
user-invocable: true
---

# Security Header Generator — Генератор заголовков безопасности

Security headers — первая линия обороны браузера. Правильно настроенные headers устраняют XSS, clickjacking, MIME-sniffing и снижают поверхность атаки.

---

## Полный набор headers

### index.html (мета-теги для SPA)

```html
<!-- index.html — CSP через мета-тег (резервный вариант) -->
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta http-equiv="Content-Security-Policy"
    content="
      default-src 'self';
      script-src 'self' 'nonce-PLACEHOLDER';
      style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
      font-src 'self' https://fonts.gstatic.com data:;
      img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in;
      media-src 'self' blob: https://*.supabase.co;
      connect-src 'self'
        https://*.supabase.co
        wss://*.supabase.co
        https://api.anthropic.com
        https://fcm.googleapis.com;
      frame-ancestors 'none';
      object-src 'none';
      base-uri 'self';
      form-action 'self';
    "
  />
  <meta http-equiv="X-Content-Type-Options" content="nosniff" />
  <meta name="referrer" content="strict-origin-when-cross-origin" />
</head>
```

---

### Vite dev server (vite.config.ts)

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(self), camera=(self), microphone=(self)',
    },
  },
  preview: {
    headers: {
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; img-src 'self' data: blob:; frame-ancestors 'none';",
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  },
});
```

---

### Supabase Edge Function (middleware шаблон)

```typescript
// Универсальный helper для security headers в Edge Functions
// supabase/functions/_shared/security-headers.ts

const ALLOWED_ORIGINS = [
  'https://your-domain.com',
  'https://www.your-domain.com',
  ...(Deno.env.get('DENO_ENV') === 'development' ? ['http://localhost:8080', 'http://localhost:3000'] : []),
];

export function getSecurityHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    // CORS
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Client-Info, apikey',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',

    // Security
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',

    // Content Type
    'Content-Type': 'application/json',
  };
}

export function corsPreflightResponse(origin: string | null): Response {
  return new Response(null, {
    status: 204,
    headers: getSecurityHeaders(origin),
  });
}

// Использование в Edge Function:
// Deno.serve(async (req) => {
//   const origin = req.headers.get('Origin');
//   if (req.method === 'OPTIONS') return corsPreflightResponse(origin);
//   const headers = getSecurityHeaders(origin);
//   ...
//   return new Response(JSON.stringify(data), { status: 200, headers });
// });
```

---

### Nginx конфигурация (для custom proxy)

```nginx
# nginx.conf — security headers
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:...';

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "geolocation=(self), camera=(self), microphone=(self), payment=()" always;
    add_header Content-Security-Policy "
        default-src 'self';
        script-src 'self';
        style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
        font-src 'self' https://fonts.gstatic.com;
        img-src 'self' data: blob: https://*.supabase.co;
        connect-src 'self' https://*.supabase.co wss://*.supabase.co;
        frame-ancestors 'none';
        object-src 'none';
        base-uri 'self';
    " always;

    # Hide server info
    server_tokens off;
    more_clear_headers Server;
}
```

---

## CSP Builder — подробная настройка

### Директивы CSP для проекта

```
default-src 'self';

# JavaScript
script-src 'self';
  # Если нужны инлайн скрипты (избегать): 'unsafe-inline'
  # Если нужны eval() (избегать): 'unsafe-eval'
  # Безопасная альтернатива: nonce-{random} или hash-{sha256-base64}

# Стили
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  # 'unsafe-inline' нужен для styled-in-js и Tailwind в dev режиме

# Изображения
img-src 'self' data: blob: https://*.supabase.co https://storage.googleapis.com;

# Медиа (аудио/видео)
media-src 'self' blob: https://*.supabase.co;

# Fetch, WebSocket, EventSource
connect-src 'self'
  https://*.supabase.co
  wss://*.supabase.co
  https://api.anthropic.com
  https://api.stripe.com
  https://fcm.googleapis.com;

# Шрифты
font-src 'self' https://fonts.gstatic.com data:;

# Фреймы (запретить embedding)
frame-src 'none';
frame-ancestors 'none';  # Защита от clickjacking (лучше чем X-Frame-Options)

# Workers и Service Workers
worker-src 'self' blob:;

# Форм action
form-action 'self';

# Base URI (предотвращает base tag injection)
base-uri 'self';

# Object/Embed (устаревшие плагины)
object-src 'none';
```

---

## Аудит текущих headers

```bash
# Проверка headers в production
curl -I https://your-domain.com 2>/dev/null | grep -iE "x-frame|x-content|strict-transport|content-security|referrer|permissions|x-xss"

# Онлайн-инструменты:
# https://securityheaders.com/ — полный анализ с оценкой
# https://observatory.mozilla.org/ — Mozilla Observatory
# https://csp-evaluator.withgoogle.com/ — CSP анализ от Google
```

---

## Чеклист Security Headers

| Header | Значение | Обязателен |
|---|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | ✅ (HTTPS) |
| `X-Content-Type-Options` | `nosniff` | ✅ |
| `X-Frame-Options` | `DENY` или `SAMEORIGIN` | ✅ |
| `Content-Security-Policy` | см. builder выше | ✅ |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | ✅ |
| `Permissions-Policy` | ограничить geo/camera/mic | ✅ |
| `X-XSS-Protection` | `1; mode=block` | ⚠️ (legacy) |
| `Cache-Control` | `no-store` для auth endpoints | ✅ |

**Оценка (securityheaders.com):**
- A+ = Все headers + HSTS preload
- A = Все основные headers
- B = Пропущены несколько
- C и ниже = требует немедленного исправления
