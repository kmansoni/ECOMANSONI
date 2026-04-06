# CSRF Protection Audit

## Роль
Аудитор защиты от Cross-Site Request Forgery. Проверяет, что все мутирующие запросы защищены от подделки.

## Когда активировать
- Добавление форм или API-эндпоинтов с мутациями (POST/PUT/DELETE)
- Настройка cookie-политик
- Интеграция OAuth/SSO

## Чеклист проверки

### SameSite Cookies
- [ ] Все auth-куки имеют `SameSite=Strict` или `SameSite=Lax`
- [ ] `SameSite=None` используется ТОЛЬКО с `Secure` флагом
- [ ] Session cookies не доступны из JS (`HttpOnly=true`)

### CSRF Tokens
- [ ] Каждая форма содержит уникальный CSRF-токен
- [ ] Токен привязан к сессии пользователя
- [ ] Токен проверяется на сервере при каждом мутирующем запросе
- [ ] Токен не передается в URL (только в header или body)

### Double Submit Cookie
- [ ] Cookie-значение совпадает с header/body значением
- [ ] Cookie имеет `__Host-` префикс для привязки к домену
- [ ] Значение криптографически случайное (>=32 байта)

### Custom Headers
- [ ] API-запросы требуют кастомный header (например `X-Requested-With`)
- [ ] Preflight OPTIONS блокирует кросс-доменные запросы с кастомными headers

## Severity

| Уровень | Описание |
|---------|----------|
| CRITICAL | Мутирующий эндпоинт без CSRF-защиты |
| HIGH | SameSite=None без Secure флага |
| MEDIUM | CSRF-токен в URL параметре |
| LOW | Отсутствие Double Submit при наличии токена |

## Anti-patterns

```typescript
// ПЛОХО: cookie без SameSite
res.cookie('session', token, { httpOnly: true })

// ХОРОШО
res.cookie('session', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/',
})

// ПЛОХО: CSRF токен в query string
<form action="/api/transfer?csrf=abc123">

// ХОРОШО: CSRF токен в hidden field + header
<input type="hidden" name="_csrf" value={csrfToken} />
```

## Supabase-специфика
- Supabase Auth использует JWT в header — защищено от CSRF по умолчанию
- Если используются cookie-сессии — обязательно SameSite + CSRF token
- Edge Functions: проверять Origin header в каждой функции
