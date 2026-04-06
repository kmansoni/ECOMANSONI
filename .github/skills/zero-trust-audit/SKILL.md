---
name: zero-trust-audit
description: "Zero Trust Architecture audit: явная проверка каждого запроса, принцип наименьших привилегий, никогда не доверять — всегда проверять. Use when: zero trust, архитектура безопасности, least privilege, каждый запрос проверять, межсервисная аутентификация."
argument-hint: "[компонент для проверки: edge-functions | frontend | server | rls | all]"
user-invocable: true
---

# Zero Trust Audit — Никогда не доверять, всегда проверять

Zero Trust: каждый запрос аутентифицирован и авторизован независимо от его источхождения (внутренний/внешний).

---

## Принципы Zero Trust

1. **Verify Explicitly** — проверять каждый запрос (JWT, RLS, ACL)
2. **Least Privilege** — минимально необходимые права
3. **Assume Breach** — проектировать как если уже взломаны
4. **Micro-segmentation** — изолировать компоненты, ограничить lateral movement

---

## Audit Layer 1: Frontend → Supabase

### Проверки

```bash
# Нет прямого доступа к service_role на клиенте
grep -rn "service_role\|SERVICE_ROLE" src/ --include="*.ts" --include="*.tsx"
# Должно быть: только в серверных компонентах/edge functions

# Auth проверка в каждом protected route
grep -rn "useAuth\|getUser\|session" src/pages/ --include="*.tsx" | head -20

# Нет обращений к sensitive таблицам без user context
grep -rn "supabase\.from('users'\|supabase\.from('profiles'" src/ --include="*.ts"
```

**Чеклист:**
- [ ] Только anon key на клиенте (VITE_SUPABASE_ANON_KEY)
- [ ] Никогда service_role key на клиенте
- [ ] Protected routes проверяют сессию перед рендером
- [ ] Выход из системы: invalidate session + очистить кэш

---

## Audit Layer 2: RLS (Row Level Security)

### Проверки

```sql
-- Все таблицы имеют RLS?
SELECT t.tablename,
  CASE WHEN p.tablename IS NULL THEN '❌ NO RLS' ELSE '✅ Has RLS' END as rls_status
FROM pg_tables t
LEFT JOIN (SELECT DISTINCT tablename FROM pg_policies) p ON t.tablename = p.tablename
WHERE t.schemaname = 'public'
ORDER BY rls_status;

-- RLS включён?
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false;

-- Sprawl: есть ли SELECT policies без user context?
SELECT tablename, policyname, qual
FROM pg_policies
WHERE schemaname = 'public'
AND qual NOT LIKE '%auth.uid()%'
AND cmd = 'SELECT';
```

**Чеклист:**
- [ ] `ALTER TABLE x ENABLE ROW LEVEL SECURITY` на КАЖДОЙ таблице
- [ ] Политики SELECT ограничивают по `auth.uid()`
- [ ] Политики UPDATE/DELETE: только владелец или admin role
- [ ] SECURITY DEFINER функции минимизированы
- [ ] anon role не имеет доступа к personal data без public flag
- [ ] Admin/service operations изолированы в Edge Functions

---

## Audit Layer 3: Edge Functions

### Проверки

```bash
# Каждая функция проверяет auth?
grep -rn "Authorization\|getUser\|verifyJWT" supabase/functions/ --include="*.ts"

# Функции не используют service_role без необходимости
grep -rn "createClient.*SERVICE_ROLE\|SUPABASE_SERVICE_ROLE" supabase/functions/
```

### Паттерн Zero Trust Edge Function

```typescript
// ✅ Явная проверка каждого запроса
Deno.serve(async (req) => {
  // 1. Verify caller identity
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 2. Validate token with Supabase Auth
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return new Response('Unauthorized', { status: 401 });

  // 3. Check authorization (not just authentication)
  const { data: membership } = await userClient
    .from('group_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('group_id', body.groupId)
    .single();
  if (!membership) return new Response('Forbidden', { status: 403 });

  // 4. Service role only for operations requiring it
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  // ... proceed with admin operation
});
```

**Чеклист:**
- [ ] Каждая Edge Function имеет явную проверку auth
- [ ] Авторизация (роль/разрешение) проверяется отдельно от аутентификации
- [ ] Service role client создаётся только там, где необходим
- [ ] Webhook endpoints: HMAC signature verification
- [ ] CORS origin whitelist (не `*` для auth endpoints)

---

## Audit Layer 4: Inter-Service Communication

```bash
# Server-to-server auth
grep -rn "x-service-token\|X-Internal\|inter-service\|shared secret" server/ services/
```

**Чеклист:**
- [ ] SFU медиа-сервер проверяет токены от frontend
- [ ] Внутренние сервисы не предполагают "доверие" по IP адресу
- [ ] Все microservices endpoints требуют auth
- [ ] Нет открытых debug/health endpoints с sensitive данными

---

## Audit Layer 5: Least Privilege

```bash
# Database roles
grep -rn "GRANT\|REVOKE" supabase/migrations/ --include="*.sql"
# Должны быть минимальные grants
```

| Компонент | Текущие права | Требуемые rights |
|---|---|---|
| anon role | ? | SELECT на public таблицы только |
| authenticated role | ? | CRUD на собственные данные |
| service_role | full | Только в Edge Functions |
| Node.js SFU | ? | Только вызов specific RPC |
| Realtime | ? | Только pub/sub в разрешённых каналах |

**Чеклист:**
- [ ] anon: нет доступа к private messages, profiles, files
- [ ] authenticated: нет UPDATE/DELETE чужих данных (RLS enforces)
- [ ] Database functions: минимальные привилегии для EXECUTE
- [ ] Storage buckets: private для user files (not public по умолчанию)
- [ ] Realtime: channel-level authorization

---

## Audit Layer 6: Assume Breach

Проектируем как если злоумышленник уже получил:
- Один JWT токен пользователя
- Доступ к одному из микросервисов
- Ключи одного из клиентских устройств

```bash
# Lateral movement — может ли compromised user атаковать других?
grep -rn "auth\.uid()" supabase/migrations/ --include="*.sql" | wc -l
# Должно быть > 0 на каждой таблице с user data
```

**Чеклист:**
- [ ] Lateral movement блокирован RLS (пользователь не видит чужие данные)
- [ ] Скомпрометированный токен: ограниченное время жизни (max 1h для access)
- [ ] Refresh token rotation: каждый refresh выдаёт новый refresh token
- [ ] Rate limiting: блокирует brute force / exfiltration
- [ ] Monitoring: аномальные паттерны обнаруживаются

---

## Итоговый Score

| Принцип | Score | Критические пробелы |
|---|---|---|
| Verify Explicitly | /10 | |
| Least Privilege | /10 | |
| Assume Breach | /10 | |
| Micro-segmentation | /10 | |
| **ИТОГО** | **/40** | |

**> 35/40** = Zero Trust Compliant
**25-34** = Needs improvement
**< 25** = Serious gaps
