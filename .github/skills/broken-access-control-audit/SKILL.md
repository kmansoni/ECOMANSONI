---
name: broken-access-control-audit
description: "Аудит OWASP A01 Broken Access Control: IDOR, privilege escalation, RLS bypass, force browsing, missing function-level access control. Use when: A01, broken access, IDOR, несанкционированный доступ к данным, эскалация привилегий."
argument-hint: "[таблица, модуль или '*' для полной проверки]"
user-invocable: true
---

# Broken Access Control — OWASP A01:2025

Наиболее часто встречающаяся уязвимость. Пользователь A получает доступ к данным пользователя B.

---

## Вектор 1: IDOR (Insecure Direct Object Reference)

Пользователь меняет ID в запросе и получает чужие данные.

```bash
# Поиск кодa с ID из URL/params без проверки владельца
grep -rn "params\.\|searchParams\.\|route\." src/pages/ --include="*.tsx" | grep "id\|Id\|ID"
grep -rn "\.eq('id'" src/hooks/ src/pages/ --include="*.ts" --include="*.tsx"
# Проверить: после .eq('id', someId) есть ли .eq('user_id', user.id)?
```

### Уязвимый паттерн

```typescript
// ❌ ОПАСНО — IDOR: любой может получить любой order
const { data } = await supabase
  .from('orders')
  .select('*')
  .eq('id', orderId)  // нет проверки что это: order текущего пользователя
  .single();

// ✅ БЕЗОПАСНО — RLS делает это автоматически
// Но если RLS не настроен, явно добавляем:
const { data } = await supabase
  .from('orders')
  .select('*')
  .eq('id', orderId)
  .eq('user_id', user.id)  // дополнительная защита
  .single();
```

### RLS защита IDOR

```sql
-- ✅ Правильная RLS политика против IDOR
CREATE POLICY "orders: read own"
ON orders FOR SELECT
USING (user_id = auth.uid());

-- Даже если клиентский код не проверяет — база блокирует
```

**Чеклист IDOR:**
- [ ] RLS: все таблицы с пользовательскими данными ограничены по `auth.uid()`
- [ ] UUIDs вместо sequential integers (сложнее угадать)
- [ ] Нет прямых запросов по ID без owner check (или RLS покрывает)
- [ ] Shared resources (channels, groups): membership check

---

## Вектор 2: Privilege Escalation

Пользователь получает права администратора или других ролей.

```bash
# Поиск role assignment без проверки
grep -rn "role.*admin\|is_admin\|user_role\|setRole" src/ supabase/ --include="*.ts" --include="*.sql"
grep -rn "UPDATE.*role\|SET role\s*=" supabase/migrations/ --include="*.sql"
```

### Уязвимый паттерн

```sql
-- ❌ ОПАСНО — пользователь может сам изменить свою роль
CREATE POLICY "profiles update" ON profiles
FOR UPDATE USING (id = auth.uid())
WITH CHECK (id = auth.uid());  -- нет ограничения на поле role!

-- ✅ БЕЗОПАСНО — запрет смены роли
CREATE POLICY "profiles update" ON profiles
FOR UPDATE USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND role = (SELECT role FROM profiles WHERE id = auth.uid())  -- роль не меняется
);

-- Или через функцию
CREATE OR REPLACE FUNCTION update_profile_safe(p_display_name text, p_avatar_url text)
RETURNS void AS $$
BEGIN
  UPDATE profiles
  SET display_name = p_display_name, avatar_url = p_avatar_url
  -- НЕТ SET role = ...
  WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
```

**Чеклист Privilege Escalation:**
- [ ] RLS WITH CHECK ограничивает изменяемые поля (роль, is_admin)
- [ ] Смена роли только через service_role (Edge Function с проверкой admin)
- [ ] `user_metadata` не используется для авторизационных решений
- [ ] Токен не содержит role из пользовательски управляемых полей

---

## Вектор 3: Missing Function-Level Access Control

```bash
grep -rn "supabase\.functions\.invoke\|fetch.*functions" src/ --include="*.ts" --include="*.tsx"
# Для каждой функции: есть ли проверка auth?
grep -rn "Authorization" supabase/functions/ --include="*.ts" -l
# Список функций без Authorization check
comm -23 \
  <(ls supabase/functions/) \
  <(grep -rl "Authorization\|getUser" supabase/functions/)
```

**Чеклист:**
- [ ] Все Edge Functions требуют Authorization header
- [ ] Admin-only functions проверяют роль (не только auth)
- [ ] Нет "development" endpoints без auth в production

---

## Вектор 4: Force Browsing (Bypass Frontend Controls)

Frontend скрывает кнопку, но endpoint всё ещё доступен.

```typescript
// ❌ ТОЛЬКО клиентская защита — можно обойти
if (user.isAdmin) {
  return <AdminPanel />;
}
// Но /api/admin-action доступен всем через curl!

// ✅ СЕРВЕР проверяет роль независимо
// В Edge Function:
const { data: profile } = await adminClient.from('profiles').select('role')
  .eq('id', user.id).single();
if (profile?.role !== 'admin') return new Response('Forbidden', { status: 403 });
```

**Чеклист:**
- [ ] Авторизация на сервере (RLS/Edge Function), не только в UI
- [ ] Admin панель: проверка роли в Edge Function/RLS
- [ ] Realtime subscriptions: channel-level auth (не только фронтенд фильтр)

---

## Вектор 5: Path Traversal

```bash
grep -rn "path\.join\|resolve\|readFile" server/ services/ --include="*.ts"
grep -rn "\.\./" server/ services/ --include="*.ts"  # traversal sequences
```

```typescript
// ❌ ОПАСНО
const filePath = path.join(uploadDir, req.params.filename);
// req.params.filename = "../../etc/passwd" → LFI

// ✅ БЕЗОПАСНО
import path from 'path';
const filename = path.basename(req.params.filename);  // только имя файла
const filePath = path.join(uploadDir, filename);
if (!filePath.startsWith(uploadDir)) throw new Error('Invalid path');
```

---

## Вектор 6: CORS Misconfiguration

```bash
grep -rn "Access-Control-Allow-Origin" supabase/functions/ --include="*.ts"
grep -rn "cors.*\*\|origin.*\*" supabase/functions/ --include="*.ts"
```

**Чеклист:**
- [ ] CORS whitelist для auth-required endpoints
- [ ] `*` только для полностью публичных resources
- [ ] `Access-Control-Allow-Credentials: true` НЕ комбинировать с `Origin: *`

---

## Итоговая матрица

| Вектор | Статус | Severity | Файл:строка |
|---|---|---|---|
| IDOR в messages | ✅/🔴 | HIGH | |
| IDOR в profiles | ✅/🔴 | HIGH | |
| IDOR в files | ✅/🔴 | HIGH | |
| Privilege escalation | ✅/🔴 | CRITICAL | |
| Missing function-level | ✅/🔴 | HIGH | |
| Force browsing admin | ✅/🔴 | HIGH | |
| Path traversal | ✅/🔴 | CRITICAL | |
| CORS wildcard | ✅/🔴 | MEDIUM | |

```
🔴 CRITICAL — исправить немедленно, блокирует деплой
🟠 HIGH — исправить в текущем спринте
🟡 MEDIUM — исправить в следующем спринте
```
