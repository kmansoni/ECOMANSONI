# FULL PROJECT + SUPABASE AUDIT REPORT
Date: 2026-03-13
Scope: Frontend quality, tests/build, dependency security, Supabase DB/RLS/RPC/Edge config, migration operability

## Executive Summary
Overall state: functional but with security and governance gaps.

What is good right now:
- Production build succeeds.
- Core automated tests pass: 49 files, 338 tests.
- Chat schema probe in build path returns OK.
- No hardcoded secrets detected in tracked source by pattern scan.

What needs urgent attention:
- Supabase has broad SECURITY DEFINER execution surface for anon/authenticated roles.
- 77 public tables do not have RLS enabled.
- 165 RLS policies use always-true conditions (some intentional, some risky).
- send_message_v1 overload duplication remains in remote DB and can cause RPC instability.
- Remote migration connectivity via CLI fails (timeout to DB:5432), increasing drift risk.

---

## Audit Method (Evidence-Based)
Checks executed during this audit:
- Build: npm run -s build
- Lint: npm run -s lint
- Tests: npm test
- Dependency vulnerabilities: npm audit --json --omit=dev
- Secret pattern scan across src/supabase/scripts/server/services
- Supabase Management API SQL checks for:
  - function signatures and grants
  - public table RLS coverage
  - policy permissiveness
  - SECURITY DEFINER executable exposure
- Supabase CLI migration list via project script output

---

## Findings by Severity

### Critical

1. SECURITY DEFINER exposure is too wide
- Evidence:
  - security_definer_total: 387
  - security_definer_auth_exec: 363
  - security_definer_anon_exec: 357
- Impact:
  - Any logic flaw in these functions can become privilege escalation.
  - Attack surface is large, especially for anon-executable functions.
- High-risk examples observed in anon-executable set:
  - admin_audit_append
  - apply_moderation_decision
  - issue_delegation_token_v1
  - moderate_hashtag
  - channel_delete_v1
  - message_delete_v1
  - internal_event_register_v1
- Recommendation:
  - Default deny EXECUTE for anon/authenticated on all SECURITY DEFINER functions.
  - Explicitly grant only whitelisted RPCs required by client.
  - Add CI gate: fail if new SECURITY DEFINER function is executable by anon unless allowlisted.

2. Public schema has non-trivial RLS gap
- Evidence:
  - public_tables_total: 454
  - public_tables_rls_enabled: 377
  - public_tables_rls_disabled: 77
- Impact:
  - Data access posture is inconsistent and can produce unintended exposure.
- Recommendation:
  - For each of 77 tables: classify as system/internal/public.
  - Enable RLS by default; add explicit read policies where true-public access is required.

### High

3. RLS policies with always-true predicates are frequent
- Evidence:
  - policies_total: 823
  - policies_with_true: 165
- Notes:
  - Some SELECT true policies are valid for public catalog-like data.
  - ALL true / service-role style policies must be reviewed carefully.
- Recommendation:
  - Introduce policy review matrix:
    - Public-read intentional
    - Internal service-role only
    - Accidental permissive
  - Add SQL lint rule to flag new policies containing bare true.

4. Chat send RPC overload drift risk persists
- Evidence:
  - Remote DB currently has both:
    - send_message_v1(conversation_id uuid, client_msg_id uuid, body text)
    - send_message_v1(conversation_id uuid, client_msg_id uuid, body text, is_silent boolean)
- Impact:
  - PostgREST RPC resolution can become unstable across environments/caches.
- Status:
  - Client was hardened to handle overload mismatch and fallback safely.
- Recommendation:
  - Unify remote DB to one canonical signature and keep compatibility wrapper only temporarily.

5. Migration operability risk (remote connectivity)
- Evidence:
  - supabase migration list fails with timeout on DB port 5432.
- Impact:
  - Hard to guarantee migration parity; drift probability increases.
- Recommendation:
  - Restore network path to remote DB or enforce API-based migration deployment path.
  - Add deployment gate that compares intended vs applied migration states.

### Medium

6. Dependency vulnerability in production graph
- Evidence:
  - npm audit reports high severity advisory in tar (GHSA-9ppj-qmqm-q256), fix available.
- Recommendation:
  - Run npm audit fix for runtime deps and pin resolved version in lockfile.

7. Lint hygiene debt (quality, maintainability)
- Evidence:
  - 386 warnings, 0 errors.
  - Dominant class: silent catch blocks and hooks dependency warnings.
- Impact:
  - Reduced observability and increased risk of hidden runtime faults.
- Recommendation:
  - Burn down warnings in phases: chat/auth/core first, then long-tail modules.

---

## Frontend / Application Quality Results

### Build
- Result: PASS
- Notable warnings:
  - lottie-web uses eval (supply-chain/runtime hardening concern)
  - Large chunk warnings (performance optimization opportunity)

### Tests
- Result: PASS
- Metrics:
  - Test files: 49 passed
  - Tests: 338 passed

### Lint
- Result: PASS with warnings
- Metrics:
  - 386 warnings, 0 errors
- Main categories:
  - silent catches without structured logging
  - react-hooks dependency warnings
  - isolated no-console policy violations

### Secret Hygiene
- Result: No obvious hardcoded secret values found in scanned tracked paths
- Git tracking check:
  - .env is not tracked
  - .env.example is tracked (expected)

---

## Supabase Edge Functions Config Review
Source: supabase/config.toml

verify_jwt=false endpoints currently include:
- phone-auth
- send-sms-otp
- verify-sms-otp
- send-email-otp
- verify-email-otp
- vk-webhook
- bot-webhook
- health
- turn-credentials

Assessment:
- Pre-auth OTP and external webhook endpoints can be valid with verify_jwt=false.
- turn-credentials with verify_jwt=false should be strictly guarded (origin, abuse control, quotas) because it provides infra credentials.

---

## Confirmed Chat-Send Related State
- chat_send_message_v11 exists and has EXECUTE for authenticated.
- send_message_v1 has two overloads in remote DB (risk noted above).
- messages table has expected core policies (SELECT/INSERT/UPDATE read mark/DELETE own), but broader DB posture still needs RLS normalization.

---

## Priority Remediation Plan

### Phase 0 (Today)
1. Restrict SECURITY DEFINER exposure:
   - Revoke anon/auth execute from all SD functions except strict allowlist.
2. Start with chat RPC canonicalization:
   - Consolidate send_message_v1 signature strategy in DB.
3. Fix migration access path:
   - Restore DB connectivity or enforce API-only migration workflow.

### Phase 1 (48h)
1. RLS normalization for 77 public tables.
2. Review and classify 165 true-based policies.
3. Patch tar vulnerability in production dependency graph.

### Phase 2 (1 week)
1. Reduce lint warnings in critical modules to near-zero.
2. Add CI controls:
   - SD exposure gate
   - RLS coverage gate
   - policy permissiveness gate
   - migration drift gate

---

## Final Verdict
Current production posture is workable from functionality perspective, but not yet hardened enough for strict security/governance requirements.

Top blockers before calling it fully robust:
- SECURITY DEFINER privilege surface
- RLS coverage/policy permissiveness
- migration drift risk

After these are addressed, the project can move to a materially stronger security and reliability baseline.
