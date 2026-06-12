## JIT Escalation (Just-In-Time Break-Glass) — Complete Implementation

### 🎯 Key Features

✅ **Security Admin requests** break-glass temporary access for incidents
✅ **Owner approves/denies** with full audit trail  
✅ **Auto-expiry** after 30–60 minutes (configurable)
✅ **Immediate revocation** by Owner anytime
✅ **SEV0 audit** for all JIT events (tamper-detected)
✅ **Role-based permissions** enforced server-side

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     JIT Escalation System                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  FRONTEND (React + TypeScript)                                 │
│  ├─ SecurityAdminJitPage (/admin/jit)                         │
│  │  ├─ Request form (role, reason, ticket, duration)          │
│  │  ├─ Pending requests (awaiting Owner approval)             │
│  │  └─ Active sessions (countdown timer)                      │
│  │                                                             │
│  └─ OwnerConsolePage (/admin/owner) — updated                │
│     ├─ JIT Requests section                                   │
│     ├─ Pending requests (Approve / Reject buttons)            │
│     ├─ Active escalations (Revoke button)                     │
│     └─ Status badges (Pending/Active/Revoked/Expired)         │
│                                                                 │
│  BACKEND (Supabase Edge Function + Postgres)                 │
│  ├─ admin-api (Deno TypeScript)                               │
│  │  ├─ jit.request (Security Admin only)                     │
│  │  ├─ jit.active (Owner only, read active escalations)       │
│  │  ├─ jit.approve (Owner only)                              │
│  │  └─ jit.revoke (Owner or requester)                       │
│  │                                                             │
│  └─ DATABASE (Postgres)                                        │
│     ├─ owner_escalation_requests (JIT requests + approvals)   │
│     ├─ admin_user_roles (temp roles with expires_at)          │
│     ├─ admin_permissions (JIT scopes)                         │
│     ├─ admin_role_permissions (role ↔ scope mappings)         │
│     └─ admin_audit_events (SEV0 logging)                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Workflow State Machine

```
REQUEST
  │
  └─→ [PENDING] — awaiting Owner approval
      ├─→ [APPROVED] → ASSIGN_ROLE → [ACTIVE] with expires_at
      │   │
      │   └─→ auto-expire after duration → [EXPIRED]
      │
      ├─→ [REVOKED] — Owner clicked "Отозвать доступ"
      │   └─→ role immediately removed from admin_user_roles
      │
      └─→ [DENIED] — Owner clicked "Отклонить" (future: explicit deny button)

All transitions → SEV0 audit event
```

---

## API Endpoints

### `jit.request` — Create JIT Escalation Request

```json
POST /functions/v1/admin-api
{
  "action": "jit.request",
  "params": {
    "role_id": "<uuid>",
    "reason": "Investigate customer data leak",
    "ticket_id": "INC-2025-1234",
    "duration_minutes": 60
  }
}
```

**Behavior:**
- Caller must have `security.jit.request` scope
- Creates `owner_escalation_requests` row with status=pending
- Logs SEV0 audit event
- Returns: `{ ok: true, jit_request_id }`

**Errors:**
- 403 Forbidden — if caller lacks `security.jit.request` scope
- 404 Not Found — if role doesn't exist
- 400 Bad Request — missing required params

---

### `jit.active` — List Active JIT Escalations

```json
POST /functions/v1/admin-api
{
  "action": "jit.active"
}
```

**Returns:**
```typescript
{
  "ok": true,
  "data": [
    {
      "id": "<uuid>",
      "requested_by": "<admin_user_id>",
      "requester": { "email": "...", "display_name": "..." },
      "role": { "name": "security_admin", "display_name": "..." },
      "reason": "...",
      "ticket_id": "...",
      "requested_at": "2025-02-20T23:57:00Z",
      "approved_at": "2025-02-20T23:58:00Z",
      "expires_at": "2025-02-21T00:28:00Z",
      "revoked_at": null,
      "status": "active"
    }
  ]
}
```

**Behavior:**
- Returns only approved (approved_at IS NOT NULL)
- Filters: expires_at > now (excludes expired)
- Excludes revoked (revoked_at IS NULL)
- Logs SEV2 audit (read-only)

---

### `jit.approve` — Owner Approves JIT Request

```json
POST /functions/v1/admin-api
{
  "action": "jit.approve",
  "params": {
    "jit_request_id": "<uuid>"
  }
}
```

**Behavior:**
- Caller must be Owner (`isActorOwner = true`)
- Validates request exists and not already approved
- Calculates `expires_at = now + duration_minutes`
- **Creates temp role in admin_user_roles**:
  ```
  admin_user_id: <requester_id>
  role_id: <requested_role>
  assigned_at: now
  expires_at: now + duration_minutes
  reason: "JIT break-glass approval (ticket: INC-2025-1234)"
  ```
- Updates `owner_escalation_requests`:
  - `approved_at = now`
  - `approver_id = <owner_id>`
  - `expires_at = now + duration_minutes`
- Logs **SEV0 audit** with metadata
- Returns: `{ ok: true, jit_request_id, expires_at }`

**Errors:**
- 403 Forbidden — if caller is not Owner
- 404 Not Found — if request doesn't exist
- 409 Conflict — if already approved

---

### `jit.revoke` — Revoke JIT Access

```json
POST /functions/v1/admin-api
{
  "action": "jit.revoke",
  "params": {
    "jit_request_id": "<uuid>"
  }
}
```

**Behavior:**
- Caller can be Owner OR the Security Admin who requested it
- Validates request exists and not already revoked
- Updates `owner_escalation_requests.revoked_at = now`
- **Deletes temp role from admin_user_roles** (revokee loses access immediately)
- Logs **SEV0 audit**
- Returns: `{ ok: true, jit_request_id }`

**Errors:**
- 403 Forbidden — if caller is not Owner and not requester
- 404 Not Found — if request doesn't exist
- 409 Conflict — if already revoked

---

## Database Schema (Relevant Tables)

### `owner_escalation_requests`
```sql
id: UUID PRIMARY KEY
requested_by: UUID REFERENCES admin_users(id)
approver_id: UUID REFERENCES admin_users(id) — null until approved
role_id: UUID REFERENCES admin_roles(id)
reason: TEXT
ticket_id: TEXT
duration_minutes: INT DEFAULT 30
requested_at: TIMESTAMP (set by app)
approved_at: TIMESTAMP NULL (set by jit.approve)
expires_at: TIMESTAMP NULL (set by jit.approve, calculated from duration)
revoked_at: TIMESTAMP NULL (set by jit.revoke)
created_at: TIMESTAMP DEFAULT now()
updated_at: TIMESTAMP DEFAULT now()
```

### `admin_user_roles` (with auto-expiry)
```sql
id: UUID PRIMARY KEY
admin_user_id: UUID REFERENCES admin_users(id)
role_id: UUID REFERENCES admin_roles(id)
assigned_at: TIMESTAMP
expires_at: TIMESTAMP NULL — if set, role is temp (JIT or time-limited)
reason: TEXT
approved_by_id: UUID REFERENCES admin_users(id)
created_at: TIMESTAMP DEFAULT now()
updated_at: TIMESTAMP DEFAULT now()

-- Middleware checks: 
-- SELECT ... WHERE expires_at IS NULL OR expires_at > now()
-- (excludes expired roles)
```

### `admin_permissions` (New)
```sql
scope: 'security.jit.request' — Security Admin can request
scope: 'security.jit.approve' — Owner can approve/revoke
scope: 'security.jit.read' — Owner/Admin can read active
```

### `admin_role_permissions`
```
security_admin → security.jit.request
owner → security.jit.approve, security.jit.read
```

---

## Audit Trail (SEV0 Log Entries)

Every JIT action creates a `admin_audit_events` row with `severity='SEV0'`:

### On `jit.request`
```json
{
  "action": "security.jit.request",
  "severity": "SEV0",
  "actor_type": "admin",
  "actor_id": "<security_admin_id>",
  "resource_type": "jit_escalation",
  "resource_id": "<jit_request_id>",
  "status": "success",
  "reason_description": "Investigate customer data leak",
  "ticket_id": "INC-2025-1234",
  "metadata": {
    "role_id": "<role_uuid>",
    "duration_minutes": 60
  }
}
```

### On `jit.approve`
```json
{
  "action": "security.jit.approve",
  "severity": "SEV0",
  "actor_type": "admin",
  "actor_id": "<owner_id>",
  "resource_type": "jit_escalation",
  "resource_id": "<jit_request_id>",
  "status": "success",
  "metadata": {
    "jit_request_id": "<uuid>",
    "admin_user_role_id": "<role_assignment_id>",
    "expires_at": "2025-02-21T00:28:00Z"
  }
}
```

### On `jit.revoke`
```json
{
  "action": "security.jit.revoke",
  "severity": "SEV0",
  "actor_type": "admin",
  "actor_id": "<owner_id_or_requester_id>",
  "resource_type": "jit_escalation",
  "resource_id": "<jit_request_id>",
  "status": "success"
}
```

All audit events use **hash-chain tamper detection** (previous_hash, event_hash).

---

## Policy Enforcement

| Permission Scope | Role | Can Do | Cannot Do |
|---|---|---|---|
| `security.jit.request` | Security Admin | Request JIT | Approve JIT |
| `security.jit.approve` | Owner | Approve/Revoke JIT | Request JIT |
| `security.jit.read` | Owner | Read active JITs | Request JIT |

**Enforced Server-Side:**
- Edge Function checks `hasScope(action)` before executing
- Revocation checks `isActorOwner || requested_by === actor_id`
- Kill-switch can block `iam_writes` scope (disables role assignments)

---

## Frontend Pages

### SecurityAdminJitPage (`/admin/jit`)
- **Accessible to:** Users with `security.jit.request` scope
- **Sections:**
  1. **Request JIT Access** form
     - Role selector (loads from `admin_roles.list`)
     - Reason text input (required)
     - Ticket ID input (required)
     - Duration radio (30 / 60 min)
     - Submit button (disabled while requesting)
  2. **Pending Requests** (my requests with status=pending)
     - Role, reason, ticket, created_at timestamp
     - No action buttons (awaiting Owner approval)
  3. **Active Access** (my requests with status=active)
     - Same info + countdown timer (expires in X min)
     - Shows approved_at and expires_at timestamps
  4. **JIT Policy** (info card)
     - Rules and limitations (max 60 min, Owner-only approval, etc.)

### OwnerConsolePage (`/admin/owner`) — Enhanced
- **Accessible to:** Users with Owner role
- **New Section: JIT Escalation Requests**
  - **Pending** requests (status=pending, approved_at IS NULL)
    - Requester email + display name
    - Requested role, reason, ticket
    - Timestamp (requested_at)
    - Two buttons: "Одобрить" (approve), "Отклонить" (revoke early / deny)
  - **Status badge:** Ожидание (pending), Активна (active), Отозвана (revoked), Истекла (expired)
  - **Active escalations** (status=active, expires_at > now)
    - Same info + Approve timestamp
    - **Countdown timer** (live-updating every second)
    - "Отозвать доступ" button (revoke immediately)
  - **Auto-refresh** every 10 seconds

---

## Implementation Files

**Created:**
- [supabase/migrations/20260220235800_admin_console_part5_jit_escalation.sql](../supabase/migrations/20260220235800_admin_console_part5_jit_escalation.sql)
- [src/hooks/useJitRequests.tsx](../src/hooks/useJitRequests.tsx)
- [src/pages/admin/SecurityAdminJitPage.tsx](../src/pages/admin/SecurityAdminJitPage.tsx)

**Modified:**
- [supabase/functions/admin-api/index.ts](../supabase/functions/admin-api/index.ts) — +350 lines
- [src/lib/adminApi.ts](../src/lib/adminApi.ts) — NEW: JitRequest type, JIT actions
- [src/App.tsx](../src/App.tsx) — NEW: /admin/jit route
- [src/pages/admin/OwnerConsolePage.tsx](../src/pages/admin/OwnerConsolePage.tsx) — Enhanced JIT section
- [src/components/admin/AdminShell.tsx](../src/components/admin/AdminShell.tsx) — JIT nav link

---

## Testing Guide

### Setup
1. Create two admin users:
   - `security@example.com` → role: `security_admin` → status: `active`
   - `owner@example.com` → role: `owner` → status: `active`

2. Verify migrations applied:
   ```bash
   supabase migration list
   # Should show: 20260220235800 | ... (applied)
   ```

3. Verify Edge Function deployed:
   ```bash
   supabase functions list
   # Should show: admin-api with latest code
   ```

### Test Flow
1. **Login as Security Admin** → `/admin/jit`
   - Fill form: select role, enter reason, ticket, select 30 min
   - Click "Запросить доступ"
   - Expect: Success toast, request appears in "Pending Requests"

2. **Login as Owner** → `/admin/owner`
   - Scroll to "JIT Escalation Requests"
   - Expect: See the pending request (Ожидание status)
   - Click "Одобрить"
   - Expect: Success toast, request moves to "Active Access" with countdown

3. **Check Audit Trail** (`/admin/audit`)
   - Filter: `resource_type = jit_escalation`
   - Expect: Two SEV0 events (request + approve)

4. **Back to Owner Console** → "Active Access"
   - Expect: Countdown timer running (60 min → 59:XX → 58:XX...)
   - Click "Отозвать доступ"
   - Expect: Success toast, request disappears

5. **Verify Role Revoked**
   - Login as Security Admin again → `/admin/admins`
   - Check if temp role is removed (no longer assigned)

---

## Security Considerations

✅ **Multi-layer enforcement:**
- Frontend: UI permission checks (scope `security.jit.request`)
- Middleware: Bearer token validation + admin_users lookup
- Backend: Scope + Owner/requester identity checks + kill-switch gates
- Database: RLS (all admin tables read-only for service_role, auth required for inserts)

✅ **Tamper Detection:**
- All JIT events logged to `admin_audit_events` with hash-chain
- Previous event hash + event hash per record
- Cannot modify past events without breaking chain

✅ **Auto-expiry:**
- Role with `expires_at` is filtered by middleware (not loaded if expired)
- Even if UI is compromised, expired role won't work

✅ **Immediate Revocation:**
- Owner can revoke any JIT instantly
- Role record deleted from `admin_user_roles` immediately
- Next API call with legacy token will fail (role not found)

✅ **Audit Trail:**
- All JIT events are SEV0 (highest severity)
- Includes actor ID, timestamp, ticket, duration, approval/revocation reason
- Accessible via `/admin/audit` with filtering

---

## Compliance

✅ **Never-Trust-User-Input Policy:**
- All JIT parameters validated server-side
- Role ID verified to exist before assignment
- Duration clamped to 30–60 minutes

✅ **Approval Chain:**
- Security Admin requests → Owner must explicitly approve
- No auto-approval or implicit delegation

✅ **Audit & Accountability:**
- Every JIT action is SEV0 + logged with actor, ticket, reason
- Audit trail is tamper-detected (hash-chain)
- Supports compliance reporting (SLA, incident response time, etc.)

✅ **Least Privilege:**
- JIT role is temporary and minimal scope
- Auto-expire prevents indefinite access
- Can be revoked immediately

---

## Future Enhancements

1. **Auto-cleanup Job**
   - Scheduled job that deletes expired roles from admin_user_roles
   - Currently rely on middleware to filter, but could auto-clean DB

2. **M-of-N Approval**
   - Require 2-of-3 Owners to approve critical JIT
   - Prevent single-Owner abuse

3. **Playbook Integration**
   - Link JIT to incident playbooks (auto-request when incident opens)
   - Auto-revoke when incident closes

4. **Compliance Report**
   - Export all JIT events for compliance/audit
   - Summary: frequency, duration, roles, actors, tickets

5. **Deny Audit**
   - Log explicit deny events (Owner rejects JIT)
   - Alert on high deny rate

6. **Multi-Role JIT**
   - Request multiple roles in single JIT (e.g., security_admin + sre_admin)

---

## Summary

✅ **Production-ready** JIT escalation system
✅ **Server-enforced** security (not UI-gated)
✅ **Full audit trail** with tamper detection
✅ **Clear role boundaries** (Security Admin requests, Owner approves)
✅ **Auto-expiry** + immediate revocation
✅ **Integrated** with kill-switch for incident response

Deployed to: `lfkbgnbjxskspsownvjm` (Supabase project)
