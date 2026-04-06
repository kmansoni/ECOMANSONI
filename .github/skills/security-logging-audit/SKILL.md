---
name: security-logging-audit
description: "Аудит security logging: что логируется, что нет, sensitive данные в логах, аудит-трейл для security событий, мониторинг аномалий. Use when: logging, мониторинг безопасности, аудит-трейл, что логировать, sensitive в логах."
argument-hint: "[компонент для проверки или 'all']"
user-invocable: true
---

# Security Logging Audit — Мониторинг безопасности

Правильное логирование критично для обнаружения атак, аудита compliance и расследования инцидентов.

---

## Принцип: Что логировать

### Обязательно логировать (Security Events)

| Событие | Severity | Поля |
|---|---|---|
| Неудачная аутентификация | WARNING | user_id/email, ip, timestamp |
| Успешный вход | INFO | user_id, ip, user_agent, timestamp |
| Выход / сессия истекла | INFO | user_id, timestamp |
| Изменение пароля | INFO | user_id, ip, timestamp |
| Изменение email | WARNING | user_id, old_email_hash, ip |
| Неудачная OTP | WARNING | phone_hash, ip, attempt_count |
| Доступ отклонён (403) | WARNING | user_id, resource, action |
| Admin действия | INFO | admin_id, action, target_id |
| Финансовые операции | INFO | user_id, amount, action |
| Создание/удаление API ключей | WARNING | user_id, ip |
| Rate limit triggered | WARNING | ip, endpoint, rate |
| Неверная подпись webhook | ERROR | source_ip, payload_hash |

### Никогда не логировать

```bash
grep -rn "console\.log.*password\|logger.*password\|log.*secret\|log.*token\|log.*key" \
  supabase/functions/ server/ services/ --include="*.ts" --include="*.js"
```

❌ **Запрещено в логах:**
- Пароли в любом виде
- JWT токены / refresh tokens
- Session IDs
- Полные номера карт / CVV
- Приватные ключи E2EE
- Секреты API
- Личные сообщения пользователей
- OTP коды

---

## Сканирование: Пустые catch блоки

```bash
grep -rn -A 3 "catch\s*(err\|error\|e)\s*{" supabase/functions/ server/ services/ \
  --include="*.ts" | grep -B 2 "^.*catch\|^.*}\s*$" | grep -v "console\."
# Найти catch блоки без логирования
```

### Паттерны

```typescript
// ❌ ПЛОХО — silent failure, нет logging
try {
  await sendNotification(userId, message);
} catch {
  // ничего
}

// ❌ ПЛОХО — sensitive data в логах
console.log('Auth failed for user:', email, 'password:', password);

// ✅ ХОРОШО — безопасное логирование с контекстом
import { logger } from '../lib/logger.ts';  // структурированный логгер

try {
  await sendNotification(userId, message);
} catch (error) {
  logger.error('notification_failed', {
    userId,               // ok — наш own identifier
    error: error instanceof Error ? error.message : 'unknown',  // только message
    // НЕТ stack trace для пользователей
  });
}
```

---

## Структурированный логгер (паттерн)

```typescript
// supabase/functions/_shared/logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  event: string;
  timestamp: string;
  requestId?: string;
  userId?: string;
  [key: string]: unknown;
}

export function createLogger(requestId: string) {
  return {
    info: (event: string, context?: Record<string, unknown>) =>
      log('info', event, { requestId, ...context }),
    warn: (event: string, context?: Record<string, unknown>) =>
      log('warn', event, { requestId, ...context }),
    error: (event: string, context?: Record<string, unknown>) =>
      log('error', event, { requestId, ...context }),
  };
}

function log(level: LogLevel, event: string, context: Record<string, unknown>) {
  const entry: LogEntry = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...sanitize(context),  // убрать sensitive поля
  };
  console.log(JSON.stringify(entry));  // structured JSON
}

function sanitize(obj: Record<string, unknown>): Record<string, unknown> {
  const SENSITIVE = ['password', 'token', 'secret', 'key', 'otp', 'cvv', 'card'];
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) =>
      SENSITIVE.some(s => k.toLowerCase().includes(s)) ? [k, '[REDACTED]'] : [k, v]
    )
  );
}
```

---

## Аудит-трейл в базе данных

```sql
-- Таблица для критических событий
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,  -- 'message_sent', 'profile_updated', 'admin_action'
  resource_type text,    -- 'message', 'channel', 'user'
  resource_id uuid,
  ip_address inet,
  user_agent text,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- RLS: только сам пользователь и admin могут читать
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log: read own" ON audit_log
FOR SELECT USING (user_id = auth.uid());

-- Индекс для поиска по пользователю
CREATE INDEX idx_audit_log_user_id ON audit_log (user_id, created_at DESC);
CREATE INDEX idx_audit_log_action ON audit_log (action, created_at DESC);
```

---

## Мониторинг аномалий

```bash
# Проверить есть ли система мониторинга
find . -name "*.ts" -exec grep -l "anomaly\|suspicious\|rate_limit\|brute_force" {} \;
```

**Аномалии для обнаружения:**
- Массовое скачивание данных (> 5000 записей за час)
- Многократные неудачные OTP попытки
- Login с разных стран за короткое время
- Массовая отправка сообщений (спам)
- Необычный объём activity ночью

---

## Чеклист Security Logging

### Обязательно присутствует
- [ ] Security events логируются (auth failures, 403, admin actions)
- [ ] Нет sensitive данных в логах (password, token, key)
- [ ] Нет пустых catch блоков в Edge Functions
- [ ] Структурированный JSON logging (не plain text)
- [ ] request_id для трассировки запросов

### Желательно
- [ ] Audit log таблица в БД для критических операций
- [ ] Мониторинг: алерты на аномальные паттерны
- [ ] Log retention policy (сколько хранить)
- [ ] Разные уровни: DEBUG (dev only), INFO, WARN, ERROR

### Нельзя
- [ ] Нет console.log с password/token/secret в любом названии
- [ ] Нет stack trace в responses
- [ ] Нет PII в logs без необходимости
