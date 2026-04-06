# Clickjacking Prevention

## Роль
Защита от clickjacking-атак. Предотвращает встраивание приложения в iframe на вредоносных сайтах.

## Когда активировать
- Настройка security headers
- Приложение содержит действия с последствиями (платежи, удаление, авторизация)
- Аудит безопасности фронтенда

## Чеклист проверки

### HTTP Headers
- [ ] `X-Frame-Options: DENY` или `SAMEORIGIN` установлен
- [ ] `Content-Security-Policy: frame-ancestors 'none'` (замена X-Frame-Options)
- [ ] Оба заголовка установлены для обратной совместимости
- [ ] Заголовки на ВСЕХ страницах, не только на главной

### CSP frame-ancestors (приоритетный)
- [ ] `frame-ancestors 'none'` — полный запрет iframe
- [ ] Или `frame-ancestors 'self'` — только свой домен
- [ ] Или `frame-ancestors 'self' https://trusted.com` — конкретные домены
- [ ] НЕ используется `frame-ancestors *`

### JavaScript Framebusting (дополнительно)
- [ ] Скрипт проверки top === self как fallback
- [ ] `style="display:none"` + показ только если top === self
- [ ] sandbox iframe ломает framebusting — полагаться только на headers

## Severity

| Уровень | Описание |
|---------|----------|
| CRITICAL | Нет X-Frame-Options и нет frame-ancestors |
| HIGH | Только JavaScript framebusting без headers |
| MEDIUM | X-Frame-Options без CSP frame-ancestors |
| LOW | SAMEORIGIN вместо DENY при отсутствии нужды во фреймах |

## Anti-patterns

```
// ПЛОХО: ничего не установлено — можно встроить в iframe
// (пустой ответ без заголовков)

// ПЛОХО: ALLOW-FROM устарел, не работает в Chrome
X-Frame-Options: ALLOW-FROM https://trusted.com

// ПЛОХО: полагаться только на JS
if (top !== self) { top.location = self.location }
// Обходится sandbox iframe

// ХОРОШО: двойная защита
X-Frame-Options: DENY
Content-Security-Policy: frame-ancestors 'none'
```

## Supabase/Vite
- Настроить headers в hosting-провайдере (Vercel/Netlify/Cloudflare)
- Edge Functions: добавить заголовки в каждый ответ
- `vite.config.ts` — настроить headers для dev-сервера
