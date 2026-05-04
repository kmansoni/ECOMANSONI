---
name: supabase-rls-auditor
description: |
  Аудит RLS политик в Supabase: проверка полноты, безопасности, тестов. 
  Use when: RLS audit, policy review, supabase security, row-level security.
license: Apache 2.0
---

# Supabase RLS Auditor — Аудит политик безопасности

Проверка RLS политик на полноту, корректность и security coverage.

## Когда использовать

- Аудит новых таблиц на RLS
- Проверка политик перед деплоем
- Security review схемы БД
- Нахождение пробелов в защите данных

## RLS Policy Structure

```sql
-- Базовый шаблон RLS политики
CREATE POLICY "policy_name"
ON table_name
FOR operation -- SELECT, INSERT, UPDATE, DELETE, ALL
TO role_name -- authenticated, anon, или конкретная роль
USING (conditions) -- для SELECT/UPDATE/DELETE
WITH CHECK (conditions); -- для INSERT/UPDATE
```

## Common Patterns

```sql
-- Пользователь видит только свои данные
CREATE POLICY "users_own_data"
ON messages
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Публичные данные для всех
CREATE POLICY "public_readable"
ON profiles
FOR SELECT
TO anon, authenticated
USING (true);

-- Админ видит всё
CREATE POLICY "admin_all"
ON audit_logs
FOR ALL
TO authenticated
USING (auth.jwt() ->> 'role' = 'admin')
WITH CHECK (auth.jwt() ->> 'role' = 'admin');
```

## Audit Checklist

### 1. Policy Existence
```sql
-- Проверить таблицы без RLS
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename NOT IN (
  SELECT tablename 
  FROM pg_policy p 
  JOIN pg_class c ON p.polyrelid = c.oid
  WHERE c.relname = pg_tables.tablename
);
```

### 2. Policy Completeness
```typescript
// src/lib/audit/rlsAudit.ts
function auditTable(tableName: string) {
  const checks = {
    hasRlsEnabled: false,
    hasSelectPolicy: false,
    hasInsertPolicy: false,
    hasUpdatePolicy: false,
    hasDeletePolicy: false,
    hasAnonAccess: false,
    hasSecurityGaps: false
  };
  
  // Query PostgreSQL for policies
  const result = sql`
    SELECT 
      CASE WHEN relrowsecurity THEN true ELSE false END as rls_enabled,
      array_agg(polytype) as policy_types
    FROM pg_policy p
    JOIN pg_class c ON p.polyrelid = c.oid
    WHERE c.relname = ${tableName}
    GROUP BY relrowsecurity
  `;
  
  return checks;
}
```

### 3. Security Issues
```sql
-- Таблицы с RLS, но пустыми политиками (deny by default)
-- Это может быть OK, но нужно проверить намеренность

-- Политики с USING, но без WITH CHECK для INSERT
-- Возможна запись произвольных данных

-- Использование auth.uid() без проверки на NULL
-- Может позволить доступ при анонимных запросах
```

## Automated Audit Script

```typescript
// src/scripts/rls-audit.ts
import { supabase } from '~/lib/supabase';

const RLS_TEMPLATE = `
-- {table} RLS migration
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;

-- {domain} policies
CREATE POLICY "{table}_select" 
ON {table} FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "{table}_insert"
ON {table} FOR INSERT TO authenticated 
WITH CHECK (user_id = auth.uid());

CREATE POLICY "{table}_update"
ON {table} FOR UPDATE TO authenticated 
USING (user_id = auth.uid()) 
WITH CHECK (user_id = auth.uid());

CREATE POLICY "{table}_delete"
ON {table} FOR DELETE TO authenticated 
USING (user_id = auth.uid());
`;

async function auditAndGenerate(table: string) {
  // Check existing policies
  const { data: policies } = await supabase.rpc('get_policies', { table_name: table });
  
  const missing = [];
  for (const op of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
    if (!policies?.find((p: any) => p.cmd.includes(op))) {
      missing.push(op);
    }
  }
  
  return {
    table,
    hasRls: !!policies?.length,
    missingPolicies: missing,
    migration: missing.length > 0 ? RLS_TEMPLATE.replace(/{table}/g, table) : null
  };
}
```

## Testing RLS

```typescript
// src/__tests__/rls.spec.ts
describe('RLS policies', () => {
  it('prevents cross-user access', async () => {
    // User 1 creates a message
    const { data: msg1 } = await supabase.auth.signInWithPassword({
      email: 'user1@test.com',
      password: 'password'
    });
    
    await supabase.from('messages').insert({ text: 'user1 message' });
    
    // User 2 tries to access
    await supabase.auth.signOut();
    await supabase.auth.signInWithPassword({
      email: 'user2@test.com',
      password: 'password'
    });
    
    // Should be empty due to RLS
    const { data } = await supabase.from('messages').select('*');
    expect(data).toHaveLength(0);
  });
});
```

## Migration Template

```sql
-- migrations/043_rls_policies.sql
-- Enable RLS on new tables

ALTER TABLE navigator_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "navigator_settings_user"
ON navigator_settings FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
```

## Common Gaps to Check

- [ ] `auth.uid()` в RETURNING для функций — утечка данных
- [ ] Политики с опечатками в именах колонок
- [ ] RLS включён, но нет политик (deny all)
- [ ] Использование `current_user` вместо `auth.uid()`
- [ ] JWT claims без валидации
- [ ] RLS на view без RLS на базовой таблице

## Checklist

- [ ] Каждая таблица имеет RLS включённым
- [ ] Каждая таблица имеет политики для нужных операций
- [ ] SELECT политика есть для всех ролей, которым нужен read
- [ ] INSERT/UPDATE/DELETE проверяют владельца записи
- [ ] ADMIN роль имеет нужные политики
- [ ] Тесты покрывают RLS сценарии
- [ ] Миграции включают RLS и политики вместе