---
name: penetration-test
description: "Методология пентеста для React + Supabase мессенджера: разведка, перечисление API, проверка аутентификации, тестирование RLS bypass, WebSocket атаки, XSS, IDOR. Use when: пентест, penetration testing, проверить безопасность, найти уязвимости."
argument-hint: "[scope: auth | api | rls | websocket | storage | all]"
user-invocable: true
---

# Penetration Test — Методология пентеста

Структурированный подход к тестированию безопасности React+Supabase мессенджера.

---

## Фаза 1: Разведка (Reconnaissance)

```bash
# Собрать публично доступную информацию

# 1. Supabase URL из кода
grep -rn "supabase\.co\|VITE_SUPABASE" src/ .env* --include="*.ts" --include="*.tsx" | head -20

# 2. Перечислить Edge Functions (из открытых источников)
grep -rn "supabase.functions.invoke\|/functions/v1/" src/ --include="*.ts" -h | \
  grep -oP "'[a-z-]+'" | sort -u

# 3. Используемые сторонние сервисы
grep -rn "api\.stripe\|api\.anthropic\|fcm\.googleapis\|sentry\.io" \
  src/ --include="*.ts" --include="*.tsx" | grep -v "//\|#" | head -20

# 4. Публичные таблицы (без RLS или с policy SELECT=true)
# Выполнить в Supabase SQL Editor:
# SELECT tablename FROM pg_tables WHERE schemaname = 'public';
```

---

## Фаза 2: Тестирование аутентификации

```bash
# 2.1 Брутфорс OTP (проверить rate limiting)
for i in $(seq 1 10); do
  curl -s -X POST "https://PROJECT_REF.supabase.co/functions/v1/verify-otp" \
    -H "Content-Type: application/json" \
    -d '{"phone":"+79001234567","code":"'"$i$i$i$i$i$i"'"}' \
    -w "\nStatus: %{http_code}\n"
  sleep 0.5
done

# 2.2 JWT с algorithm=none (для кастомных JWT endpoint)
# Декодировать JWT, сменить alg на none, передать без подписи

# 2.3 Проверить refresh token после logout
# После supabase.auth.signOut() попробовать использовать старый refresh token
```

---

## Фаза 3: Тестирование API (Edge Functions)

```bash
BASE="https://lfkbgnbjxskspsownvjm.supabase.co/functions/v1"
ANON_KEY="$(grep VITE_SUPABASE_ANON_KEY .env.local | cut -d= -f2)"
USER_TOKEN="<JWT пользователя>"
ADMIN_TOKEN="<JWT администратора>"

# 3.1 Без авторизации (должен вернуть 401)
curl -s "$BASE/send-message" -H "apikey: $ANON_KEY" \
  -d '{"channel_id":"...", "content":"test"}' -w "\nStatus: %{http_code}\n"

# 3.2 Горизонтальная эскалация (IDOR через API)
# Попробовать получить данные другого пользователя
OTHER_USER_ID="..." # ID другого пользователя
curl -s "$BASE/get-profile?user_id=$OTHER_USER_ID" \
  -H "Authorization: Bearer $USER_TOKEN" -w "\nStatus: %{http_code}\n"

# 3.3 Вертикальная эскалация
curl -s "$BASE/admin-action" -H "Authorization: Bearer $USER_TOKEN" \
  -d '{"action":"ban_user"}' -w "\nStatus: %{http_code}\n"
```

---

## Фаза 4: RLS Bypass Testing

```sql
-- В Supabase SQL Editor с ролью authenticated (не service_role):
-- 4.1 Прямой доступ к чужим сообщениям
SELECT * FROM messages WHERE sender_id != auth.uid() LIMIT 5;
-- Ожидание: 0 строк (RLS блокирует)

-- 4.2 Попытка обновить чужой профиль
UPDATE profiles SET display_name = 'HACKED' WHERE id != auth.uid();
-- Ожидание: 0 строк обновлено

-- 4.3 Получение чужих E2EE ключей
SELECT * FROM user_key_bundles WHERE user_id != auth.uid();
-- Ожидание: 0 строк
```

---

## Фаза 5: WebSocket тестирование

```javascript
// В браузере DevTools Console
const ws = new WebSocket('wss://lfkbgnbjxskspsownvjm.supabase.co/realtime/v1/websocket?...');

ws.onopen = () => {
  // 5.1 Подписаться на чужой приватный канал
  ws.send(JSON.stringify({
    topic: "realtime:private-messages",
    event: "phx_join",
    payload: { user_token: "..." },
    ref: "1"
  }));
};

// 5.2 Проверить фильтрацию сообщений на сервере
// Даже если подписка прошла — проверить что данные не утекают
```

---

## Фаза 6: File Storage

```bash
STORAGE="https://lfkbgnbjxskspsownvjm.supabase.co/storage/v1"

# 6.1 Прямой доступ к чужим файлам (должен давать 403)
curl -s "$STORAGE/object/private-user-files/other-user-id/photo.jpg" \
  -H "Authorization: Bearer $USER_TOKEN" -w "\nStatus: %{http_code}\n"

# 6.2 Path traversal в именах файлов
curl -s -X POST "$STORAGE/object/avatars/../../../config" \
  -H "Authorization: Bearer $USER_TOKEN" -w "\nStatus: %{http_code}\n"
```

---

## Документация результатов

Каждую уязвимость документировать в формате:

```
Уязвимость: [название]
Категория: [OWASP A01-A10]
Серьёзность: CRITICAL | HIGH | MEDIUM | LOW
Endpoint/файл: [где обнаружена]
Шаги воспроизведения:
  1. ...
  2. ...
Ожидаемое поведение: [что должно происходить]
Фактическое поведение: [что происходит]
Рекомендация: [как исправить]
```
