# JIT Escalation Implementation - Testing Guide

## Что реализовано

### 1. Database Migration (20260220235800_admin_console_part5_jit_escalation.sql)
✅ Permissions для JIT:
- `security.jit.request` — только Security Admin может запросить
- `security.jit.approve` — только Owner может одобрить  
- `security.jit.read` — Owner может читать активные JIT

### 2. Edge Function (supabase/functions/admin-api/index.ts)
✅ Новые действия:

#### `jit.request` (Security Admin only)
```typescript
// Request JIT escalation
POST /admin-api
{
  "action": "jit.request",
  "params": {
    "role_id": "<uuid>",
    "reason": "Investigate security incident",
    "ticket_id": "INC-12345",
    "duration_minutes": 30  // или 60
  }
}
// Returns: { ok: true, jit_request_id: "<uuid>" }
```

**Server-side checks:**
- Проверка scope `security.jit.request` (Security Admin only)
- Проверка существования role
- Сохранение в `owner_escalation_requests` таблицу
- SEV0 аудит (critical security event)

#### `jit.approve` (Owner only)
```typescript
// Approve JIT escalation
POST /admin-api
{
  "action": "jit.approve",
  "params": {
    "jit_request_id": "<uuid>"
  }
}
// Returns: { ok: true, jit_request_id, expires_at }
```

**Server-side actions:**
- Проверка что вызывающий — Owner (`isActorOwner`)
- Проверка что запрос не одобрен ранее
- Вычисление `expires_at = now + duration_minutes`
- Создание временной роли в `admin_user_roles` с `expires_at`
- Обновление `owner_escalation_requests.approved_at`, `approver_id`, `expires_at`
- SEV0 аудит

#### `jit.active`
```typescript
// List active JIT escalations
POST /admin-api
{
  "action": "jit.active"
}
// Returns: { ok: true, data: JitRequest[] }
```

Возвращает только одобренные, не истёкшие, не отозванные запросы.

#### `jit.revoke` (Owner или Security Admin - свой запрос)
```typescript
// Revoke JIT escalation
POST /admin-api
{
  "action": "jit.revoke",
  "params": {
    "jit_request_id": "<uuid>"
  }
}
```

### 3. Frontend Pages

#### SecurityAdminJitPage (`/admin/jit`)
- **Видят**: Security Admin (scope `security.jit.request`)
- **Функции**:
  1. **Request JIT Access**: Form с role, reason, ticket_id, duration (30/60 min)
  2. **Pending Requests**: Список своих запросов, ожидающих одобрения Owner
  3. **Active Access**: Список активных сессий с countdown до истечения
  4. **JIT Policy**: Информация о правилах

#### OwnerConsolePage (`/admin/owner`) — обновлена
- **Kill Switches**: Управление kill-switch (существующее)
- **JIT Escalation Requests**: 
  - Pending requests с кнопками "Одобрить"/"Отклонить"
  - Active escalations с автоматическим countdown и кнопкой "Отозвать доступ"
  - Status badge (Ожидание, Активна, Отозвана, Истекла)

### 4. Navigation
- AdminShell добавил ссылку на `/admin/jit`
- Видна для Security Admin (scope `security.jit.request`)

---

## Workflow

### Сценарий: Security Admin просит доступ

1. **Security Admin** переходит на `/admin/jit`
2. Заполняет форму:
   - Role: `security_admin` (пример)
   - Reason: `Investigate customer data leak`
   - Ticket: `INC-2025-1234`
   - Duration: `60 minutes`
3. Нажимает **"Запросить доступ"**
4. API вызывает `jit.request` → создаёт запись в `owner_escalation_requests`
5. Запрос появляется в `Pending Requests` на странице Security Admin

### Owner видит запрос

1. **Owner** переходит на `/admin/owner`
2. Видит карточку в **"JIT Escalation Requests"**:
   - Имя запрашивающего: `security_admin@example.com`
   - Роль: `security_admin`
   - Причина: `Investigate customer data leak`
   - Ticket: `INC-2025-1234`
   - Status: `Ожидание`
3. Нажимает **"Одобрить"**
4. API вызывает `jit.approve`:
   - Вычисляет `expires_at = now + 60 min`
   - Создаёт временную роль (`admin_user_roles` с `expires_at`)
   - Логирует SEV0 аудит
5. Запрос становится **"Активна"** с countdown

### Security Admin использует доступ

1. Все его запросы в admin API теперь включают роль `security_admin` (автоматически загружается в middleware)
2. Может выполнять операции, требующие этой роли
3. Видит свою активную сессию с countdown

### Owner отзывает доступ

1. Owner видит **"Active Access"** карточку
2. Нажимает **"Отозвать доступ"**
3. API вызывает `jit.revoke`:
   - Помечает `owner_escalation_requests.revoked_at = now`
   - Удаляет временную роль из `admin_user_roles`
   - Логирует SEV0 аудит
4. Доступ сразу прекращается

---

## Аудит

Все действия логируются как **SEV0** (highest severity):

```
action: security.jit.request
resource_type: jit_escalation
severity: SEV0
status: success/denied
reason_description: "Request reason"
ticket_id: "INC-XXXXX"
metadata: { role_id, duration_minutes }

---

action: security.jit.approve
resource_type: jit_escalation
severity: SEV0
metadata: { jit_request_id, admin_user_role_id, expires_at }

---

action: security.jit.revoke
resource_type: jit_escalation
severity: SEV0
```

Все события доступны в `/admin/audit` с фильтрацией.

---

## Testing

### 1. Проверка миграции
```bash
supabase migration list
# Должна быть: 20260220235800_admin_console_part5_jit_escalation
```

### 2. Проверка функции
```bash
supabase functions deploy admin-api
# Должны быть обновлены: jit.request, jit.active, jit.approve, jit.revoke
```

### 3. Проверка UI
```bash
npm run build
# SecurityAdminJitPage и обновленный OwnerConsolePage должны как-то выглядеть
```

### 4. E2E Test (вручную)

**Setup:**
- Создать двух admin user: `security@test.com` (role: security_admin), `owner@test.com` (role: owner)
- Обе в статусе "active"

**Test:**
1. Залогиниться как security@test.com → `/admin/jit`
2. Запросить JIT на роль `security_admin`, reason="test", ticket="TEST-1"
3. Его запрос должен появиться в "Pending Requests"
4. Залогиниться как owner@test.com → `/admin/owner`
5. Его запрос должен быть в "JIT Escalation Requests" (Pending)
6. Нажать "Одобрить"
7. Проверить в `/admin/audit` что запись с severity=SEV0 для approve
8. Запрос должен стать "Active" на обеих страницах
9. Нажать "Отозвать доступ"
10. Запрос должен стать "Revoked"
11. Проверить аудит

---

## Политика (как закодировано)

✅ **Security Admin может** — запрашивать JIT (`security.jit.request` scope)
✅ **Owner может** — одобрять JIT (`security.jit.approve` scope)
❌ **Security Admin не может** — одобрять (нет scope)
❌ **Owner не может** — запрашивать (нет scope, есть только `approve`)

**Отзыв**:
- Owner может отозвать любой запрос
- Security Admin может отозвать только сво

й запрос

---

## Следующие шаги (Future)

1. **Auto-cleanup job**: Автоматический отзыв истёкших ролей (cron job или trigger)
2. **Multi-role JIT**: Allow requesting multiple roles at once
3. **M-of-N approval**: Require 2 скоба из 3 Owner для критических JIT
4. **Playbook integration**: Kill-switch playbooks с JIT для incident response
5. **Compliance report**: Summary всех JIT использований за период

