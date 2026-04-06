# CORS Policy Auditor

## Роль
Аудитор CORS-политик. Проверяет корректность кросс-доменных настроек, предотвращает утечку данных через неправильную конфигурацию.

## Когда активировать
- Настройка Edge Functions или API
- Появление CORS-ошибок в браузере
- Добавление нового домена/окружения

## Чеклист проверки

### Origins
- [ ] `Access-Control-Allow-Origin` НЕ содержит `*` для запросов с credentials
- [ ] Whitelist origins — явный список, не regex с обходами
- [ ] Origin проверяется точным совпадением (не `.includes()`, не `.endsWith()`)
- [ ] Нет отражения Origin из запроса без валидации (reflection attack)

### Methods & Headers
- [ ] `Access-Control-Allow-Methods` содержит только нужные методы
- [ ] `Access-Control-Allow-Headers` не включает `*` в production
- [ ] `Access-Control-Expose-Headers` ограничен необходимым минимумом

### Credentials
- [ ] `Access-Control-Allow-Credentials: true` только с явным origin (не `*`)
- [ ] Cookies передаются только на доверенные origins

### Preflight
- [ ] `Access-Control-Max-Age` установлен (рекомендуется 3600)
- [ ] OPTIONS запросы обрабатываются корректно
- [ ] Preflight не кэшируется слишком долго (max 86400)

## Severity

| Уровень | Описание |
|---------|----------|
| CRITICAL | `Allow-Origin: *` + `Allow-Credentials: true` |
| CRITICAL | Отражение Origin без валидации |
| HIGH | Regex-whitelist с обходом (`evil.com.attacker.com`) |
| MEDIUM | Wildcard в Allow-Headers |
| LOW | Слишком большой Max-Age |

## Anti-patterns

```typescript
// ПЛОХО: отражение origin без проверки
const origin = req.headers.get('origin')
res.headers.set('Access-Control-Allow-Origin', origin!)

// ХОРОШО: whitelist
const ALLOWED = ['https://app.example.com', 'https://staging.example.com']
const origin = req.headers.get('origin') ?? ''
if (ALLOWED.includes(origin)) {
  res.headers.set('Access-Control-Allow-Origin', origin)
}

// ПЛОХО: endsWith обход
if (origin.endsWith('.example.com')) // evil-example.com пройдёт!

// ХОРОШО: точный парсинг
const url = new URL(origin)
if (url.hostname === 'example.com' || url.hostname.endsWith('.example.com'))
```

## Edge Functions (Supabase)
- Стандартный CORS-хелпер в `supabase/functions/_shared/cors.ts`
- Каждая функция должна обрабатывать OPTIONS отдельно
- Dev-origins (localhost) разрешены только через переменную окружения
