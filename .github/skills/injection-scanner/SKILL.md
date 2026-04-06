---
name: injection-scanner
description: "Сканирует SQL injection, XSS, command injection, prototype pollution и template injection специфично для React + Supabase стека. Use when: injection уязвимости, XSS, SQL injection, dangerouslySetInnerHTML, eval, innerHTML."
argument-hint: "[путь к файлу или директории]"
user-invocable: true
---

# Injection Scanner — React + Supabase

Охватывает 6 типов injection для нашего стека: SQL, XSS, Command, Template, Prototype Pollution, NoSQL.

---

## XSS (Cross-Site Scripting) — React

### Опасные паттерны

```bash
# 1. Прямой HTML рендеринг
grep -rn "dangerouslySetInnerHTML" src/ --include="*.tsx" --include="*.ts"

# 2. DOM manipulation
grep -rn "\.innerHTML\s*=" src/
grep -rn "\.outerHTML\s*=" src/
grep -rn "document\.write(" src/

# 3. JavaScript URL
grep -rn "href.*javascript:" src/
grep -rn "src.*javascript:" src/

# 4. eval и производные
grep -rn "eval(" src/
grep -rn "new Function(" src/
grep -rn "setTimeout(.*string\|setInterval(.*string" src/

# 5. Вставка в DOM напрямую
grep -rn "insertAdjacentHTML" src/
```

### Примеры уязвимого кода

```tsx
// ❌ ОПАСНО — XSS
<div dangerouslySetInnerHTML={{ __html: message.content }} />
<a href={user.profile_url}>ссылка</a>  // если url = "javascript:alert(1)"

// ✅ БЕЗОПАСНО
import DOMPurify from 'dompurify'
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(message.content) }} />
// Для URL:
const safeUrl = url.startsWith('https://') ? url : '#'
```

### Чеклист XSS
- [ ] `dangerouslySetInnerHTML` — только с `DOMPurify.sanitize()`
- [ ] Пользовательские URLs проверяются на `https://` / allowlist
- [ ] Markdown рендерер настроен с `sanitize: true`
- [ ] Нет innerHTML/outerHTML с user data
- [ ] Content-Security-Policy header установлен

---

## SQL Injection — Supabase

Supabase использует PostgREST → основной риск в `.rpc()` с raw SQL в SECURITY DEFINER функциях.

```bash
# Ищем raw SQL
grep -rn "\.rpc(\|supabase\.rpc(" supabase/ src/ --include="*.ts" --include="*.sql"
grep -rn "EXECUTE\|EXECUTE format\|EXECUTE '" supabase/migrations/ --include="*.sql"
grep -rn "format(.*\$\|format(.*||" supabase/migrations/ --include="*.sql"
```

### Уязвимый паттерн в PostgreSQL

```sql
-- ❌ ОПАСНО — dynamic SQL без parameterization
CREATE OR REPLACE FUNCTION search_messages(q text)
RETURNS TABLE (...) AS $$
BEGIN
  RETURN QUERY EXECUTE 'SELECT * FROM messages WHERE content LIKE ''%' || q || '%''';
END;
$$ LANGUAGE plpgsql;

-- ✅ БЕЗОПАСНО — параметризованный запрос
CREATE OR REPLACE FUNCTION search_messages(q text)
RETURNS TABLE (...) AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM messages
  WHERE content ILIKE '%' || q || '%';  -- оператор ILIKE с concat безопасен
END;
$$ LANGUAGE plpgsql;

-- ✅ Или через format() с %L (literal quoting)
EXECUTE format('SELECT * FROM %I WHERE id = %L', table_name, user_id);
```

### Чеклист SQL Injection
- [ ] Нет EXECUTE с конкатенацией строк
- [ ] format() использует `%L` и `%I` (не `%s`) для пользовательских данных
- [ ] RPC функции валидируют input типы (integer, uuid)
- [ ] Нет `.sql()` raw query в клиентском коде

---

## Prototype Pollution

```bash
grep -rn "Object\.assign({}, " src/ --include="*.ts"
grep -rn "\[key\]\s*=" src/ --include="*.ts"  # dynamic key assignment
grep -rn "extend(" src/ --include="*.ts"
```

### Примеры

```typescript
// ❌ ОПАСНО
function mergeOptions(target: any, source: any) {
  for (const key in source) {
    target[key] = source[key];  // если source = {"__proto__": {"isAdmin": true}}
  }
}

// ✅ БЕЗОПАСНО
const merged = structuredClone({ ...defaults, ...userInput });
// Или явная валидация ключей:
const ALLOWED_KEYS = ['theme', 'language', 'timezone'] as const;
```

### Чеклист
- [ ] Динамические ключи объектов валидируются через allowlist
- [ ] `Object.assign()` → пересмотреть на `structuredClone` или spread
- [ ] JSON.parse() user data проходит через Zod/валидацию схемы

---

## Command Injection (Node.js сервисы)

```bash
grep -rn "exec(\|execSync(\|spawn(" server/ services/ --include="*.js" --include="*.ts"
grep -rn "child_process" server/ services/ --include="*.js" --include="*.ts"
```

### Примеры

```typescript
// ❌ ОПАСНО
exec(`ffmpeg -i ${userInput.filename} output.mp4`)

// ✅ БЕЗОПАСНО — массив аргументов
spawn('ffmpeg', ['-i', userInput.filename, 'output.mp4'])
// + валидация имени файла: /^[a-zA-Z0-9_.\-]+$/.test(filename)
```

---

## Template Injection

```bash
grep -rn "template\|render.*{{\|nunjucks\|handlebars\|ejs" server/ services/ --include="*.ts"
```

---

## Итоговый чеклист

| Тип | Статус | Файл:строка |
|---|---|---|
| XSS dangerouslySetInnerHTML | ✅/🔴 | |
| XSS innerHTML | ✅/🔴 | |
| XSS user URLs | ✅/🔴 | |
| SQL в .rpc() | ✅/🔴 | |
| SQL в migrations | ✅/🔴 | |
| Prototype Pollution | ✅/🔴 | |
| Command Injection | ✅/🔴 | |

## Fix Priorities

🔴 **CRITICAL** (блокирует деплой):
- dangerouslySetInnerHTML без санитизации
- EXECUTE с конкатенацией user input
- Command injection в shell

🟠 **HIGH** (исправить до следующего спринта):
- innerHTML с user data
- Динамические ключи объектов без allowlist
- user URLs без проверки протокола
