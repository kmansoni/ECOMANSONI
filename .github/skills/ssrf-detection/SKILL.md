# SSRF Detection

## Роль
Детектор Server-Side Request Forgery. Предотвращает запросы к внутренним сервисам через серверный код.

## Когда активировать
- Edge Functions принимают URL от пользователя
- Webhooks, callback URLs, image proxy
- Интеграция с внешними API по user-provided URL

## Чеклист проверки

### Internal IP Blocking
- [ ] Блокировка `127.0.0.0/8` (localhost)
- [ ] Блокировка `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` (private)
- [ ] Блокировка `169.254.169.254` (cloud metadata — AWS/GCP/Azure)
- [ ] Блокировка `0.0.0.0`, `::1`, `[::]` (IPv6 localhost)
- [ ] Блокировка `fd00::/8` (IPv6 private)

### URL Validation
- [ ] Только HTTPS разрешён (не HTTP, не FTP, не file://)
- [ ] URL парсится через стандартный парсер (не regex)
- [ ] IP-адрес из DNS-резолва проверяется ПОСЛЕ резолва
- [ ] Whitelist разрешённых доменов для webhook URLs

### DNS Rebinding Protection
- [ ] DNS-резолв выполняется один раз, IP кэшируется
- [ ] Повторный резолв не выполняется между проверкой и запросом
- [ ] TTL DNS-записей контролируется
- [ ] Или используется pinned DNS resolver

### Ответ сервера
- [ ] Тело ответа НЕ возвращается пользователю целиком
- [ ] Ошибки подключения не раскрывают внутреннюю топологию
- [ ] Timeout на исходящие запросы (макс 10 секунд)

## Severity

| Уровень | Описание |
|---------|----------|
| CRITICAL | Доступ к cloud metadata (169.254.169.254) |
| CRITICAL | Чтение произвольных файлов через file:// |
| HIGH | Запрос к внутренним сервисам (localhost, private IP) |
| MEDIUM | DNS rebinding не предотвращён |
| LOW | Ответ внутреннего сервиса утекает в error message |

## Anti-patterns

```typescript
// ПЛОХО: прямой fetch по user URL
const url = req.body.webhook_url
const res = await fetch(url) // SSRF!

// ХОРОШО: валидация + блокировка internal
import { isPrivateIP } from '@/lib/security'

function validateExternalUrl(raw: string): URL {
  const url = new URL(raw)
  if (url.protocol !== 'https:') throw new Error('HTTPS only')
  // Резолвить DNS и проверить IP
  const ip = await dnsResolve(url.hostname)
  if (isPrivateIP(ip)) throw new Error('Internal IP blocked')
  return url
}
```

## Edge Functions
- Supabase Edge Functions имеют доступ к внутренней сети
- Любой fetch по пользовательскому URL — потенциальный SSRF
- Использовать allowlist доменов для исходящих запросов
