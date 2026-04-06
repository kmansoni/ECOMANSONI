---
name: mass-assignment-scanner
description: "Сканирование mass assignment уязвимостей: неконтролируемое создание/обновление записей через пользовательский ввод, parameter pollution, Supabase .insert()/.update() без allowlist. Use when: mass assignment, parameter pollution, небезопасный insert, небезопасный update."
argument-hint: "[файл или модуль для проверки]"
user-invocable: true
---

# Mass Assignment Scanner — Небезопасное присваивание параметров

Mass assignment возникает когда пользовательский ввод напрямую передаётся в БД без явной фильтрации полей.

---

## Паттерны уязвимостей

### ❌ Уязвимо — прямой spread пользовательских данных

```typescript
// ОПАСНО: любое поле из body попадает в БД
const body = await req.json();
const { data } = await supabase.from('profiles').update(body).eq('id', userId);

// ОПАСНО: spread form data без фильтрации
const formData = Object.fromEntries(new FormData(form));
await supabase.from('users').update(formData).eq('id', id);

// ОПАСНО: передача req.body напрямую
const { data } = await supabase.from('orders').insert(req.body);
```

### ✅ Безопасно — явный allowlist полей

```typescript
// БЕЗОПАСНО: только явно разрешённые поля
const body = await req.json();
const allowedFields = {
  display_name: body.display_name,
  avatar_url: body.avatar_url,
  bio: body.bio,
  // НЕ включаем: role, is_admin, credits, email, phone
} as const;
const { data } = await supabase.from('profiles').update(allowedFields).eq('id', userId);

// БЕЗОПАСНО: Zod для валидации и strip лишних полей
import { z } from 'zod';
const ProfileUpdateSchema = z.object({
  display_name: z.string().max(100).optional(),
  avatar_url: z.string().url().optional(),
  bio: z.string().max(500).optional(),
}); // .strip() по умолчанию убирает лишние поля

const validated = ProfileUpdateSchema.parse(body); // throws on invalid
await supabase.from('profiles').update(validated).eq('id', userId);
```

---

## Grep-паттерны для поиска уязвимостей

```bash
# Подозрительные паттерны spread в Supabase операциях
grep -rn "\.insert\s*(\s*{" src/ supabase/functions/ --include="*.ts" --include="*.tsx" -A2 | \
  grep -B1 "body\|req\.\|payload\|formData\|input"

# Прямая передача объектов без деструктуризации
grep -rn "\.update\s*(\s*body\b\|\.update\s*(\s*payload\b\|\.insert\s*(\s*body\b" \
  src/ supabase/functions/ --include="*.ts" -n

# spread operator в DB операциях
grep -rn "\.insert\s*(\s*\.\.\.\|\.update\s*(\s*\.\.\." \
  src/ supabase/functions/ --include="*.ts" -n

# Поиск Object.fromEntries с последующим insert/update
grep -rn "fromEntries\|Object\.assign" src/ supabase/functions/ --include="*.ts" -n
```

---

## Опасные поля (никогда не принимать от пользователя напрямую)

```typescript
// ЗАПРЕЩЁННЫЕ поля для пользовательского ввода:
const PROTECTED_FIELDS = [
  'role',          // роль пользователя
  'is_admin',      // флаг администратора
  'is_banned',     // флаг блокировки
  'credits',       // баланс/валюта
  'quota',         // лимиты
  'email',         // email (менять через auth)
  'phone',         // телефон (менять через auth)
  'verified',      // верификация
  'created_at',    // системные timestamps
  'updated_at',
  'deleted_at',
  'owner_id',      // владелец записи
] as const;
```

---

## RLS как резервная защита

RLS не заменяет allowlist, но служит резервным барьером:

```sql
-- Пример: защита поля role через CHECK constraint
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'moderator', 'admin'));

-- RLS policy: обычный пользователь не может поменять role
CREATE POLICY "users_cannot_update_role" ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    -- role может менять только admin (через service role)
    role = (SELECT role FROM profiles WHERE id = auth.uid())
  );
```

---

## Чеклист

- [ ] Все `.insert()` и `.update()` используют явный allowlist полей
- [ ] Нет прямого `...body` или `...req.body` в DB запросах
- [ ] Zod / валидационная схема с `.strip()` применяется на boundary
- [ ] Защищённые поля (role, is_admin, credits) недоступны через API
- [ ] RLS WITH CHECK защищает критические поля как резервный барьер
- [ ] Edge Functions не принимают произвольные поля в payload
