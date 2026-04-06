# CSP Header Generator

## Роль
Генератор и аудитор Content Security Policy. Создает строгие CSP-политики, блокирующие XSS и инъекции.

## Когда активировать
- Настройка HTTP-заголовков безопасности
- После обнаружения XSS-уязвимости
- Подключение внешних скриптов, стилей, шрифтов

## Чеклист проверки

### Базовые директивы
- [ ] `default-src 'self'` — запрет всего по умолчанию
- [ ] `script-src` — без `'unsafe-inline'` и `'unsafe-eval'`
- [ ] `style-src` — nonce или hash вместо `'unsafe-inline'`
- [ ] `img-src` — явный список доменов + `data:` только для иконок
- [ ] `font-src` — только нужные CDN
- [ ] `connect-src` — все API endpoints + WebSocket URLs

### Защитные директивы
- [ ] `frame-ancestors 'none'` или конкретные домены (вместо X-Frame-Options)
- [ ] `base-uri 'self'` — блокировка подмены base URL
- [ ] `form-action 'self'` — ограничение form targets
- [ ] `object-src 'none'` — блокировка Flash/Java applets
- [ ] `upgrade-insecure-requests` — автоматический HTTP→HTTPS

### Мониторинг
- [ ] `report-uri` или `report-to` настроен
- [ ] `Content-Security-Policy-Report-Only` для тестирования новых политик
- [ ] Отчеты собираются и анализируются

## Severity

| Уровень | Описание |
|---------|----------|
| CRITICAL | Нет CSP заголовка вообще |
| CRITICAL | `script-src 'unsafe-inline' 'unsafe-eval'` |
| HIGH | `default-src *` или отсутствует default-src |
| MEDIUM | `img-src *` — позволяет tracking pixels |
| LOW | Нет report-uri для мониторинга нарушений |

## Шаблон строгой CSP

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-{random}';
  style-src 'self' 'nonce-{random}';
  img-src 'self' https://your-supabase.supabase.co data:;
  font-src 'self' https://fonts.gstatic.com;
  connect-src 'self' https://your-supabase.supabase.co wss://your-supabase.supabase.co;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
  object-src 'none';
  upgrade-insecure-requests;
  report-uri /api/csp-report
```

## Anti-patterns

```
// ПЛОХО: всё разрешено
Content-Security-Policy: default-src *

// ПЛОХО: inline скрипты разрешены
script-src 'self' 'unsafe-inline'

// ХОРОШО: nonce-based
script-src 'self' 'nonce-abc123randomvalue'
```
