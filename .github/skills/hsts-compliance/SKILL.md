# HSTS Compliance

## Роль
Аудитор HTTP Strict Transport Security. Гарантирует, что весь трафик идет через HTTPS без downgrade-атак.

## Когда активировать
- Настройка production-деплоя
- Аудит SSL/TLS конфигурации
- Настройка CDN/reverse proxy

## Чеклист проверки

### Основной заголовок
- [ ] `Strict-Transport-Security` установлен на всех HTTPS-ответах
- [ ] `max-age` >= 31536000 (1 год), рекомендуется 63072000 (2 года)
- [ ] `includeSubDomains` включен — поддомены тоже через HTTPS
- [ ] НЕ отправляется на HTTP (только HTTPS) — иначе MitM подменит

### Preload
- [ ] `preload` директива добавлена в заголовок
- [ ] Домен зарегистрирован на hstspreload.org
- [ ] ВСЕ поддомены поддерживают HTTPS (требование preload)
- [ ] Нет HTTP-only сервисов на поддоменах

### Миграция
- [ ] HTTP→HTTPS редирект 301 (не 302)
- [ ] Редирект происходит ДО установки HSTS
- [ ] Все внутренние ссылки используют HTTPS
- [ ] Mixed content отсутствует (HTTP ресурсы на HTTPS странице)

## Severity

| Уровень | Описание |
|---------|----------|
| CRITICAL | Нет HSTS — возможен SSL stripping |
| HIGH | max-age < 6 месяцев |
| HIGH | HSTS отправляется по HTTP |
| MEDIUM | Нет includeSubDomains |
| LOW | Нет preload, не зарегистрирован |

## Правильный заголовок

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

## Anti-patterns

```
// ПЛОХО: слишком маленький max-age
Strict-Transport-Security: max-age=86400

// ПЛОХО: нет includeSubDomains — поддомены уязвимы
Strict-Transport-Security: max-age=31536000

// ПЛОХО: HSTS на HTTP — MitM может удалить заголовок
// (HSTS работает ТОЛЬКО на HTTPS)

// ХОРОШО: полная конфигурация
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

## Проверка

```bash
# Проверка заголовка
curl -sI https://example.com | grep -i strict-transport

# Проверка preload статуса
# https://hstspreload.org/?domain=example.com
```
