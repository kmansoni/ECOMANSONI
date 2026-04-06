---
name: deserialization-scanner
description: "Поиск небезопасной десериализации: JSON.parse без проверки, eval, Function constructor, prototype pollution через merge, __proto__ injection. Use when: deserialization, unsafe JSON parse, prototype pollution, eval injection, __proto__."
argument-hint: "[файл или директория для сканирования]"
user-invocable: true
---

# Deserialization Scanner — Небезопасная десериализация

Небезопасная десериализация позволяет атакующему выполнить произвольный код или изменить поведение приложения через модификацию сериализованных данных.

---

## Паттерны уязвимостей

### ❌ eval и Function constructor

```typescript
// КРИТИЧНО: RCE через eval
const userCode = req.body.code;
eval(userCode); // Arbitrary code execution!

const fn = new Function('return ' + userCode)(); // Тоже опасно!

// ОПАСНО: JSON в eval
eval('(' + jsonString + ')'); // Использовать JSON.parse вместо eval
```

### ❌ Prototype Pollution через глубокое слияние

```typescript
// ОПАСНО: злоумышленник передаёт { "__proto__": { "isAdmin": true } }
function deepMerge(target: any, source: any) {
  for (const key of Object.keys(source)) {
    if (typeof source[key] === 'object') {
      deepMerge(target[key] ??= {}, source[key]); // ❌ __proto__ не фильтруется
    } else {
      target[key] = source[key];
    }
  }
}

// После этого: ({}).isAdmin === true — у ВСЕХ объектов!
```

### ✅ Безопасное слияние

```typescript
// Безопасный deepMerge с защитой от prototype pollution
function safeMerge<T extends object>(target: T, source: Partial<T>): T {
  for (const key of Object.keys(source) as Array<keyof T>) {
    // Запрещаем опасные ключи
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    const val = source[key];
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      target[key] = safeMerge((target[key] ?? {}) as T[keyof T] & object, val as any);
    } else {
      target[key] = val as T[keyof T];
    }
  }
  return target;
}
```

---

## JSON.parse — безопасные паттерны

```typescript
// ❌ Без валидации
const data = JSON.parse(rawInput); // Может быть чем угодно!

// ✅ JSON.parse + типовая проверка
function safeJsonParse<T>(raw: string, validator: (v: unknown) => v is T): T | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return validator(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ✅ С Zod
import { z } from 'zod';
const MessageSchema = z.object({
  type: z.enum(['text', 'image', 'audio']),
  content: z.string().max(10000),
  timestamp: z.number().int().positive(),
});

function parseMessage(raw: string) {
  try {
    return MessageSchema.parse(JSON.parse(raw));
  } catch {
    return null; // fail-closed
  }
}
```

---

## Grep-паттерны для поиска

```bash
# eval и Function constructor
grep -rn "\beval\s*(\|new\s*Function\s*(" src/ supabase/ --include="*.ts" --include="*.tsx" -n

# Prototype pollution риск
grep -rn "__proto__\|constructor\[.prototype\]\|Object\.assign\s*({}" src/ --include="*.ts" -n

# deepMerge без фильтрации
grep -rn "deepMerge\|deep_merge\|merge\s*(\s*target\|lodash.*merge\|_.merge" \
  src/ --include="*.ts" --include="*.tsx" -n

# JSON.parse без try/catch
grep -rn "JSON\.parse\s*(" src/ supabase/ --include="*.ts" --include="*.tsx" -n | \
  grep -v "try\|catch" -A5

# Небезопасный localStorage JSON.parse
grep -rn "JSON\.parse\s*(\s*localStorage\|JSON\.parse\s*(\s*sessionStorage" \
  src/ --include="*.ts" --include="*.tsx" -n
```

---

## localStorage — безопасная десериализация

```typescript
// ❌ Опасно: данные из localStorage без валидации
const cached = JSON.parse(localStorage.getItem('userData') ?? '{}');
const role = cached.role; // может быть подделан!

// ✅ Безопасно: validate + не доверять для security decisions
function getCachedProfile(): CachedProfile | null {
  try {
    const raw = localStorage.getItem('userProfile');
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return CachedProfileSchema.parse(parsed);
  } catch {
    localStorage.removeItem('userProfile'); // Сброс при невалидных данных
    return null;
  }
}
// ⚠️ Данные из localStorage используем ТОЛЬКО для UI/кэш
// Никогда для security (роли, права) — только из JWT или Supabase Auth
```

---

## Чеклист

- [ ] Нет `eval()` с пользовательским вводом
- [ ] Нет `new Function()` с пользовательским вводом
- [ ] `JSON.parse()` обёрнут в try/catch + схему валидации
- [ ] deepMerge защищён от `__proto__` и `constructor`
- [ ] localStorage данные не используются для security decisions
- [ ] Webhook payloads валидируются по схеме перед обработкой
- [ ] Protobuf/MessagePack десериализация через схему (если используется)
