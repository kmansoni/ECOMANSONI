# Admin Console Architecture - Production Grade

## 1. THREAT MODEL

| Asset | Threat | Impact | Mitigation |
|-------|--------|--------|-----------|
| User PII | Admin extracts bulk data | Mass privacy breach, GDPR fines | Field-level RLS, export requires approval+ticket, watermark, audit |
| E2E Messages | Admin tries to read content | Constitutional privacy breach | Zero access to content; only metadata with privacy filter |
| Admin Credentials | Credential theft/phishing | Full platform compromise | WebAuthn-only, device binding, IP allowlist, short sessions |
| Audit Logs | Tampering/deletion | Loss of accountability | Append-only table, hash chain, WORM storage, separate DB |
| Owner Account | Single point of failure | Platform takeover | M-of-N for critical ops, break-glass procedures, kill-switch |
| Bulk Operations | Mass ban/deletion abuse | Service disruption, data loss | Rate limits, dry-run, approvals, max batch size 100 |
| API Keys | Leaked service keys | Backend compromise | No keys in UI, rotation-only, vault storage, auto-expire |
| PII in Logs | Logging sensitive data | Compliance violation | Auto-masking, sanitization, log retention 90d |
| Session Hijacking | Stolen session tokens | Unauthorized access | Short TTL (15min), device binding, re-auth for critical ops |
| Insider Threat | Malicious moderator | Abuse of power | Least privilege, 4-eyes, anomaly detection, quota limits |
| Export Abuse | Downloading user data | Data exfiltration | Watermark, signed URLs (1h TTL), download log, DLP scan |
| Feature Flags | Unauthorized rollout | Service outage | Staged deployment, approval for production, rollback plan |
| SQL Injection | Direct DB access attempts | Data breach | Parameterized queries, RLS, no raw SQL in UI |
| CSRF | Cross-site request forgery | Unauthorized actions | CSRF tokens, SameSite cookies, Origin validation |
| XSS | Script injection in admin UI | Session theft | CSP strict, sanitization, React auto-escaping |
| Privilege Escalation | Role manipulation | Unauthorized access | Server-side RBAC check, policy engine, immutable roles |
| DDOS on Admin API | API overload | Service unavailable | Rate limiting (100 req/min/admin), WAF, circuit breaker |
| Time-based Attacks | Using access after revoke | Stale permissions | Short cache TTL, push revocation, real-time policy check |
| Side-channel Leaks | Timing/error messages | Information disclosure | Constant-time checks, generic errors, no details in 4xx |
| Supply Chain | Compromised npm package | Code injection | Lock files, Snyk scan, vendor review, SRI for CDN |

## 2. RBAC/ABAC SYSTEM

### Roles Hierarchy

```
OWNER (Messenger Owner)
  ├─ Security Admin
  ├─ SRE Admin
  ├─ Compliance Officer
  ├─ Finance Ops
  │
  ├─ Trust & Safety Lead
  │   ├─ T&S Moderator L2
  │   └─ T&S Moderator L1
  │
  ├─ Support Lead
  │   ├─ Support Agent L2
  │   └─ Support Agent L1
  │
  ├─ Business Ops Manager
  │   └─ Partner Manager
  │
  └─ Read-Only Auditor
```

### Core Permissions (Scopes)

#### IAM
- `iam.admin.create` - Create admin accounts
- `iam.admin.read` - List/view admins
- `iam.admin.update` - Modify admin details
- `iam.admin.deactivate` - Deactivate admin
- `iam.role.assign` - Assign roles (requires approval)
- `iam.session.revoke` - Force logout
- `iam.policy.manage` - Edit RBAC policies

#### Users
- `users.read.basic` - View user profile (masked)
- `users.read.full` - View full profile (sensitive)
- `users.read.devices` - View device list
- `users.action.suspend` - Temporary suspension
- `users.action.ban` - Permanent ban
- `users.action.shadowban` - Shadow ban
- `users.action.rate_limit` - Apply rate limits
- `users.export` - Export user data (requires approval)

#### Moderation
- `moderation.reports.read` - View report queue
- `moderation.reports.assign` - Assign to self
- `moderation.case.create` - Create case
- `moderation.case.update` - Update case
- `moderation.action.warn` - Issue warning
- `moderation.action.content_remove` - Remove content
- `moderation.action.restrict` - Restrict account
- `moderation.appeal.review` - Review appeals

#### Security
- `security.audit.read` - View audit logs
- `security.audit.export` - Export audit (approval)
- `security.risk.read` - View risk scores
- `security.risk.update` - Update risk rules
- `security.killswitch` - Emergency shutdown
- `security.investigation.open` - Start investigation
- `security.forensic.request` - Request PII reveal

#### Operations
- `ops.metrics.read` - View dashboards
- `ops.alerts.manage` - Configure alerts
- `ops.jobs.read` - View background jobs
- `ops.flags.read` - View feature flags
- `ops.flags.update` - Modify flags (approval for prod)
- `ops.config.read` - View configs
- `ops.config.update` - Modify configs (approval)

#### Compliance
- `compliance.dsar.read` - View DSAR requests
- `compliance.dsar.execute` - Execute DSAR
- `compliance.retention.manage` - Retention policies
- `compliance.legal_hold.create` - Create hold

#### Finance
- `finance.transactions.read` - View transactions
- `finance.refunds.execute` - Process refunds
- `finance.reports.export` - Export financial data

### Role-Permission Matrix

| Role | Key Permissions | Constraints |
|------|----------------|-------------|
| **OWNER** | iam.admin.*, iam.role.assign, security.audit.read, security.killswitch, security.investigation.open | Cannot access user data directly; JIT escalation only |
| **Security Admin** | security.*, iam.session.revoke, users.action.ban | Require ticket for bulk ops |
| **SRE Admin** | ops.*, users.read.basic | No PII access |
| **T&S Moderator L2** | moderation.*, users.action.*, users.read.full | Max 50 actions/day, require L1 review for bans |
| **T&S Moderator L1** | moderation.reports.*, moderation.action.warn, users.read.basic | Max 20 actions/day, escalate to L2 |
| **Support L2** | users.read.full, users.action.suspend, moderation.case.create | Require ticket, 1 hour session |
| **Support L1** | users.read.basic, moderation.reports.read | Cannot action directly |
| **Compliance Officer** | compliance.*, security.audit.export, users.export | Legal request required |
| **Finance Ops** | finance.* | Cannot access user messages/metadata |
| **Read-Only Auditor** | *.read | Cannot modify anything |

### ABAC Policies (Dynamic Constraints)

```javascript
// Example Policy Rules
{
  "user_ban": {
    "permissions": ["users.action.ban"],
    "conditions": {
      "AND": [
        { "role": ["T&S Moderator L2", "Security Admin", "OWNER_ESCALATED"] },
        { "ticket_id": "REQUIRED" },
        { "reason_code": "IN", "values": ["SPAM", "FRAUD", "CSAM", "TERRORISM"] },
        { "target.region": "SAME_AS", "actor.allowed_regions" },
        { "approval_required": true, "approvers": 2 }
      ]
    },
    "rate_limit": "10/hour",
    "audit_severity": "SEV1"
  },
  
  "bulk_export": {
    "permissions": ["users.export"],
    "conditions": {
      "AND": [
        { "role": ["Compliance Officer", "Security Admin"] },
        { "legal_request_id": "REQUIRED" },
        { "approval_required": true, "approvers": 1, "approver_role": "OWNER" },
        { "max_users": 100 }
      ]
    },
    "actions": ["watermark", "signed_url", "ttl_1h", "log_download"],
    "audit_severity": "SEV0"
  },
  
  "feature_flag_prod": {
    "permissions": ["ops.flags.update"],
    "conditions": {
      "AND": [
        { "environment": "production" },
        { "approval_required": true, "approvers": 1, "approver_role": "SRE Admin" },
        { "rollback_plan": "REQUIRED" }
      ]
    },
    "audit_severity": "SEV2"
  }
}
```

## 3. INFORMATION ARCHITECTURE

### Admin Console Menu Structure

```
ADMIN CONSOLE
│
├─ 🏠 Dashboard (Metrics overview, recent activity)
│
├─ 👥 IAM & Access [OWNER/Security Admin]
│   ├─ Admin Users
│   ├─ Roles & Permissions
│   ├─ Active Sessions
│   ├─ Approval Queue
│   └─ Access Requests (JIT)
│
├─ 👤 Users [Support/T&S]
│   ├─ User Search
│   ├─ User Detail
│   ├─ Bulk Actions (approval required)
│   └─ Export Requests
│
├─ ⚖️ Moderation [T&S]
│   ├─ Report Queue
│   ├─ Cases
│   ├─ Content Review
│   ├─ Appeals
│   └─ Enforcement History
│
├─ 🛡️ Security & Risk [Security Admin]
│   ├─ Audit Logs
│   ├─ Risk Dashboard
│   ├─ Fraud Detection
│   ├─ IP/Device Lists
│   ├─ Rate Limits
│   └─ Kill Switches
│
├─ 📊 Operations [SRE]
│   ├─ Service Health
│   ├─ Feature Flags
│   ├─ Remote Config
│   ├─ Background Jobs
│   ├─ Migrations
│   └─ Alerts
│
├─ ⚖️ Compliance [Compliance Officer]
│   ├─ DSAR Requests
│   ├─ Legal Holds
│   ├─ Retention Policies
│   └─ Export Packages
│
├─ 💰 Finance [Finance Ops]
│   ├─ Transactions
│   ├─ Refunds
│   ├─ Chargebacks
│   └─ Reports
│
├─ 🏢 Business Ops [Business Ops]
│   ├─ Organizations
│   ├─ Partner Management
│   ├─ CRM Modules
│   └─ Licensing
│
└─ 👑 OWNER CONSOLE [OWNER ONLY]
    ├─ Admin Directory
    ├─ Admin Audit Timeline
    ├─ Security Center
    ├─ M-of-N Approvals
    ├─ Break-Glass Requests
    └─ Platform Kill Switches
```

## 4. OWNER ROLE SPECIFICATION

### Owner Capabilities (Non-Data Access)

**CAN DO:**
1. Create/deactivate admin accounts
2. Assign/revoke roles (with approval for critical roles)
3. View ALL admin audit logs (masked PII)
4. Revoke any admin session
5. Configure admin access policies (IP allowlist, MFA requirements)
6. Approve break-glass requests
7. Initiate security investigations
8. Enable kill switches (moderation/export/bulk ops)
9. Configure M-of-N approval thresholds
10. Request forensic reveals (requires approval from external compliance)

**CANNOT DO (without JIT escalation):**
1. View user messages/calls content
2. Execute moderation actions directly
3. Access financial transaction details
4. Export user data
5. Modify user profiles
6. View unmasked PII in audit logs

### Owner Authentication Requirements

- **Primary Auth**: WebAuthn/Passkey ONLY (no password fallback)
- **MFA**: Required on every login
- **Device Binding**: Maximum 3 registered devices
- **IP Allowlist**: Configure allowed IP ranges
- **Geo Fence**: Configure allowed countries
- **Session TTL**: 15 minutes (short)
- **Re-auth**: Required for every critical operation
- **Step-up Auth**: Additional challenge for SEV0 actions

### Owner Audit (Highest Severity)

All Owner actions logged as `SEV0`:
- Can never be deleted
- Immediately replicated to cold storage
- Triggers real-time alerts to security paging
- Monthly audit reports to compliance

### Multi-Owner Mode (M-of-N)

```sql
-- owners table supports multi-owner
CREATE TABLE owners (
  id UUID PRIMARY KEY,
  admin_user_id UUID REFERENCES admin_users(id),
  mode TEXT CHECK (mode IN ('single', 'multi')),
  m_of_n_config JSONB -- {"m": 2, "n": 3}
);

-- Critical operations require M signatures
CREATE TABLE owner_approvals (
  id UUID PRIMARY KEY,
  operation_type TEXT,
  operation_payload JSONB,
  required_approvers INT,
  approvals JSONB[], -- [{owner_id, timestamp, signature}]
  status TEXT,
  expires_at TIMESTAMPTZ
);
```

## 5. SECURITY CONTROLS

### Authentication Stack
- SSO: OIDC/SAML for admin IdP
- MFA: TOTP + WebAuthn
- Device Posture: Optional (managed devices only)
- Session: JWT (15min) + Refresh (7d, rotation)

### Authorization Stack
- Policy Engine: Casbin / OPA
- RBAC: Role-based access control
- ABAC: Attribute-based policies
- RLS: Row-level security in Postgres
- Field-level: Encryption + masking

### Audit Stack
- Append-only table (no UPDATE/DELETE)
- Hash chain: SHA-256(prev_hash + event_json)
- Periodic anchor: Publish root hash to immutable ledger (optional: blockchain/S3 with versioning lock)
- Retention: 7 years (compliance)
- Export: Watermarked, signed, TTL 1h

### Approval Stack
- 4-eyes principle: Two admins for critical ops
- M-of-N: Multi-owner quorum
- Time-bound: Auto-reject after 24h
- Audit trail: Who approved, when, from where

## Next Steps

1. ✅ Threat Model & RBAC Design
2. ⏳ Database Schema (admin tables)
3. ⏳ Policy Engine Implementation
4. ⏳ Audit Service
5. ⏳ Admin API
6. ⏳ Admin UI
7. ⏳ Owner Console
