# Open Redirect Scanner

## Роль
Сканер уязвимостей открытого перенаправления. Находит эндпоинты, позволяющие редирект на произвольные URL.

## Когда активировать
- Реализация login/logout redirect
- Обработка URL-параметров `redirect`, `next`, `return_to`, `callback`
- OAuth callback endpoints

## Чеклист проверки

### URL Validation
- [ ] Все redirect-параметры проверяются перед использованием
- [ ] Только relative URLs разрешены (начинаются с `/`)
- [ ] Или explicit whitelist разрешённых доменов
- [ ] `//evil.com` распознается как абсолютный URL (protocol-relative)

### Whitelist подход
- [ ] Список разрешённых redirect-доменов в конфигурации
- [ ] Проверка через `new URL()` с парсингом hostname
- [ ] Поддомены проверяются точно (не `.endsWith()`)

### Encoding Bypass
- [ ] Двойное URL-кодирование не обходит фильтр (`%252F` → `%2F` → `/`)
- [ ] Unicode normalization не создает обход
- [ ] `\` (backslash) обрабатывается как `/` в некоторых браузерах
- [ ] `@` в URL не используется для обхода (`https://legit.com@evil.com`)
- [ ] Null byte `%00` не обрезает URL

## Severity

| Уровень | Описание |
|---------|----------|
| HIGH | Открытый редирект после аутентификации (фишинг + кража токена) |
| HIGH | Redirect с передачей токена в URL |
| MEDIUM | Открытый редирект без auth-контекста |
| LOW | Редирект только на страницы без sensitive данных |

## Anti-patterns

```typescript
// ПЛОХО: прямое использование параметра
const next = searchParams.get('next')
window.location.href = next! // open redirect!

// ПЛОХО: проверка startsWith
if (url.startsWith('/')) redirect(url) // //evil.com пройдет!

// ПЛОХО: проверка домена через includes
if (url.includes('example.com')) // evil.com/example.com пройдет!

// ХОРОШО: строгая валидация
function safeRedirect(url: string, fallback = '/'): string {
  try {
    const parsed = new URL(url, window.location.origin)
    if (parsed.origin !== window.location.origin) return fallback
    return parsed.pathname + parsed.search
  } catch {
    return fallback
  }
}
```

## Места поиска в коде
- `window.location.href =`
- `window.location.replace(`
- `navigate(` с динамическим параметром
- `redirect(` в серверном коде
- URL параметры: `next`, `redirect`, `return`, `callback`, `url`, `goto`
