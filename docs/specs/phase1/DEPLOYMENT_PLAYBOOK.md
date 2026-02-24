# Phase 1 Trust-lite: Deployment Playbook

**Status:** ✅ Ready for Production  
**Date:** 2026-02-24  
**Phase:** 1 Core (Trust-lite ONLY)

---

## Pre-Deployment Checklist

### Environment Verification

- [ ] Supabase CLI installed and authenticated
- [ ] Project linked to production (`lfkbgnbjxskspsownvjm`)
- [ ] Database password available (for secure prompt)
- [ ] Backup of current database taken
- [ ] Rollback script prepared

### Code Review

- [ ] All 8 migrations reviewed and approved
- [ ] No `core_*` table dependencies (Phase 2 independent)
- [ ] All RPC functions have `assert_actor_context_v1()`
- [ ] All tables have `REVOKE` statements
- [ ] All tables have RLS enabled
- [ ] CI drift gate passing locally

### Team Coordination

- [ ] Stakeholders notified of deployment window
- [ ] Incident response team on standby
- [ ] Communication channel established (#deployments)

---

## Deployment Steps

### Step 1: Local Validation (10 min)

```bash
# Reset local DB to clean state
supabase db reset

# Verify all migrations apply successfully
supabase db push --dry-run

# Expected output: 8 Phase 1 migrations ready to apply
# - 20260224020001_phase1_tenant_model.sql
# - 20260224020002_phase1_scope_registry.sql
# - 20260224020003_phase1_service_identities.sql
# - 20260224020004_phase1_delegations.sql
# - 20260224020005_phase1_trust_core.sql
# - 20260224020006_phase1_trust_rpc.sql
# - 20260224020007_phase1_retention_cleanup.sql
# - 20260224020008_phase1_seed_data.sql

# Apply locally
supabase db push

# Verify tables created
supabase db execute --query "
  SELECT tablename 
  FROM pg_tables 
  WHERE schemaname='public' 
    AND (tablename LIKE '%tenant%' OR tablename LIKE '%trust%' OR tablename LIKE '%delegation%' OR tablename LIKE '%service_%')
  ORDER BY tablename
"

# Expected: 10 tables
# - delegations
# - delegation_tokens
# - rate_limit_configs
# - risk_events
# - scope_definitions
# - service_identities
# - service_keys
# - tenant_members
# - tenants
# - trust_profiles

# Verify RPC functions
supabase db execute --query "
  SELECT proname 
  FROM pg_proc 
  WHERE proname LIKE '%_v1' 
    AND pronamespace = 'public'::regnamespace
  ORDER BY proname
"

# Expected: 12+ functions including:
# - assert_actor_context_v1
# - assert_service_active_v1
# - assert_tenant_member_v1
# - calculate_trust_score_v1
# - cleanup_phase1_retention_v1
# - enforce_rate_limit_v1
# - get_service_key_v1
# - get_trust_tier_v1
# - get_user_tenant_id_v1
# - issue_delegation_token_v1
# - purge_delegation_tokens_v1
# - purge_risk_events_v1
# - purge_service_keys_v1
# - record_risk_event_v1
# - validate_scopes_v1
```

**Success Criteria:**
- ✅ All migrations applied without errors
- ✅ All tables exist with correct schemas
- ✅ All RPC functions created
- ✅ No warnings about missing dependencies

---

### Step 2: Generate Types (5 min)

```bash
# Generate TypeScript types from DB schema
supabase gen types typescript --schema public > src/lib/supabase/phase1-types.ts

# Verify types file created
ls -lh src/lib/supabase/phase1-types.ts

# Expected: File exists, size ~50-100KB

# Commit generated types
git add src/lib/supabase/phase1-types.ts
git add schemas/phase1/trust-registry.ts
git commit -m "Phase 1: Generate types from migrations"
```

**Success Criteria:**
- ✅ `phase1-types.ts` generated successfully
- ✅ File contains all Phase 1 enums and tables
- ✅ No TypeScript compilation errors

---

### Step 3: Drift Detection (5 min)

```bash
# Run drift detection gate
npm run phase1:verify-drift

# Expected output:
# 🔍 Introspecting RPC functions from database...
# ⚠️  No snapshot found, creating baseline...
# ✅ Created snapshot: schemas/phase1/rpc-snapshot.json
# 
# 🔤 Checking TypeScript types drift...
# ⚠️  No committed types found, generating...
# ✅ Generated types: src/lib/supabase/phase1-types.ts
# 
# 🔐 Checking assert_actor_context_v1() enforcement...
# ✅ All write RPC functions call assert_actor_context_v1()
# 
# ✅ ALL CHECKS PASSED - No drift detected

# Commit baseline snapshots
git add schemas/phase1/rpc-snapshot.json
git commit -m "Phase 1: Add RPC snapshot baseline"

# Push to trigger CI
git push origin feature/phase1-trust-lite
```

**Success Criteria:**
- ✅ No drift detected
- ✅ Snapshots committed
- ✅ CI checks passing on PR

---

### Step 4: Production Dry-Run (10 min)

```bash
# Link to production (if not already linked)
supabase link --project-ref lfkbgnbjxskspsownvjm

# CRITICAL: Dry-run first (NO actual changes)
supabase db push --dry-run --linked

# Carefully review output:
# 1. Check migration count (should be exactly 8)
# 2. Verify no destructive operations (DROP, ALTER breaking)
# 3. Confirm no dependencies on existing tables missing
# 4. Review all CREATE TABLE statements
# 5. Check all RPC function signatures

# Expected warnings (acceptable):
# - "create table public.tenants" (new table, expected)
# - "create function assert_actor_context_v1" (new function, expected)

# STOP if you see:
# - "drop table ..." (unexpected!)
# - "alter table ... drop column ..." (data loss!)
# - "constraint violation" (schema conflict!)
```

**Success Criteria:**
- ✅ Dry-run completes without errors
- ✅ Only CREATE operations (no DROP/destructive ALTER)
- ✅ No constraint violations
- ✅ Migration count matches expectation (8)

**⚠️ CHECKPOINT:** Do not proceed if dry-run shows errors or unexpected operations.

---

### Step 5: Backup Production Database (15 min)

```bash
# Option 1: Supabase Dashboard
# 1. Go to https://supabase.com/dashboard/project/lfkbgnbjxskspsownvjm/database/backups
# 2. Click "Create backup"
# 3. Name: "pre-phase1-trust-lite-2026-02-24"
# 4. Wait for completion (~10-15 min)

# Option 2: CLI (if available)
supabase db dump --file backups/pre-phase1-$(date +%Y%m%d-%H%M%S).sql

# Verify backup file
ls -lh backups/*.sql | tail -1

# Expected: Backup file exists, size >10MB (depending on data)
```

**Success Criteria:**
- ✅ Backup created successfully
- ✅ Backup downloadable/restorable
- ✅ Backup timestamp recorded

**⚠️ CHECKPOINT:** Proceed ONLY after backup confirmed.

---

### Step 6: Deploy to Production (5 min)

**Maintenance Window:** 5 minutes (0 expected downtime)  
**Rollback Time:** <2 minutes (DROP tables)

```bash
# Final check: Are you ready?
echo "Deploying Phase 1 Trust-lite to production at $(date)"
echo "Type 'YES' to proceed:"
read CONFIRM

if [ "$CONFIRM" != "YES" ]; then
  echo "Deployment cancelled"
  exit 1
fi

# Deploy migrations
supabase db push --linked

# Monitor output for errors
# Expected: All 8 migrations applied successfully

# Timestamp deployment
echo "Phase 1 deployed at: $(date)" >> DEPLOYMENT_LOG.md
```

**Success Criteria:**
- ✅ All migrations applied without errors
- ✅ No timeout or connection issues
- ✅ Deployment logged with timestamp

---

### Step 7: Post-Deployment Verification (10 min)

```bash
# === 1. Verify Table Creation ===
supabase db execute --query "
  SELECT 
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
  FROM pg_tables 
  WHERE schemaname='public' 
    AND (tablename LIKE '%tenant%' OR tablename LIKE '%trust%' OR tablename LIKE '%delegation%' OR tablename LIKE '%service_%')
  ORDER BY tablename
" --linked

# Expected: 10 tables, all showing size (even if 0 bytes)

# === 2. Verify RLS Enabled ===
supabase db execute --query "
  SELECT tablename, rowsecurity 
  FROM pg_tables 
  WHERE schemaname='public' 
    AND (tablename LIKE '%tenant%' OR tablename LIKE '%trust%' OR tablename LIKE '%delegation%' OR tablename LIKE '%service_%')
  ORDER BY tablename
" --linked

# Expected: ALL tables show rowsecurity = true

# === 3. Verify RPC Functions ===
supabase db execute --query "
  SELECT 
    proname as function_name,
    prosecdef as is_security_definer,
    provolatile as volatility
  FROM pg_proc 
  WHERE proname LIKE '%_v1' 
    AND pronamespace = 'public'::regnamespace
  ORDER BY proname
" --linked

# Expected: All functions exist, write functions have prosecdef = true

# === 4. Verify Seed Data ===
supabase db execute --query "SELECT COUNT(*) as scope_count FROM scope_definitions" --linked
# Expected: 9 scopes

supabase db execute --query "SELECT COUNT(*) as config_count FROM rate_limit_configs" --linked
# Expected: 12 configs (4 tiers × 3 actions)

# === 5. Verify REVOKE Enforcement ===
# Try to INSERT as authenticated (should fail)
supabase db execute --query "
  INSERT INTO tenants (name) VALUES ('test-tenant')
" --linked --db-url <regular-user-connection-string>

# Expected: ERROR: permission denied for table tenants

# === 6. Test RPC (smoke test) ===
supabase db execute --query "
  SELECT get_trust_tier_v1('user', '<test-user-uuid>')
" --linked

# Expected: Returns 'B' (default tier) or tier for existing user
```

**Success Criteria:**
- ✅ All tables created with RLS enabled
- ✅ All RPC functions operational
- ✅ Seed data loaded (9 scopes, 12 configs)
- ✅ Direct writes blocked (REVOKE working)
- ✅ RPC calls succeed

---

### Step 8: Integration Verification (15 min)

**Test Delegation Flow:**

```bash
# 1. Create test tenant (via admin RPC - TODO: implement)
# 2. Add tenant member
# 3. Create service identity
# 4. Generate service key
# 5. Issue delegation token
# 6. Validate token

# Placeholder: Manual testing via Supabase SQL Editor
# Full integration tests in src/test/phase1/integration.test.ts (TODO)
```

**Test Trust Scoring:**

```bash
# 1. Record risk event (service_role)
# 2. Calculate trust score
# 3. Update trust tier
# 4. Get trust tier (user-facing)

# Via SQL Editor (service_role):
SELECT record_risk_event_v1(
  'user',
  '<test-user-uuid>',
  'failed_login',
  -5.0,
  '{"ip":"1.2.3.4"}'::jsonb,
  'req-test-001'
);

SELECT calculate_trust_score_v1('user', '<test-user-uuid>');

# Via client SDK (authenticated):
const tier = await supabase.rpc('get_trust_tier_v1', {
  p_actor_type: 'user',
  p_actor_id: null // defaults to current user
});

console.log('Trust tier:', tier); // Expected: 'B' or 'C' depending on score
```

**Success Criteria:**
- ✅ Risk events recordable via RPC
- ✅ Trust scores calculable
- ✅ Trust tiers readable by users

---

### Step 9: Monitoring Setup (10 min)

```bash
# Add Phase 1 tables to Supabase monitoring dashboard
# 1. Go to https://supabase.com/dashboard/project/lfkbgnbjxskspsownvjm/logs
# 2. Filter for Phase 1 tables and RPC
# 3. Setup alerts for:
#    - Error rate on RPC functions > 5%
#    - delegation_tokens table growth > 10k/hour
#    - risk_events insert rate > 1k/min

# Log deployment metrics
cat > PHASE1_DEPLOYMENT_METRICS.md << 'EOF'
# Phase 1 Deployment Metrics

**Deployment Date:** $(date)

## Tables Created
- tenants
- tenant_members
- scope_definitions
- service_identities
- service_keys
- delegations
- delegation_tokens
- trust_profiles
- risk_events
- rate_limit_configs

## RPC Functions Deployed
- assert_actor_context_v1
- calculate_trust_score_v1
- record_risk_event_v1
- get_trust_tier_v1
- enforce_rate_limit_v1
- issue_delegation_token_v1
- cleanup_phase1_retention_v1
- purge_delegation_tokens_v1
- purge_service_keys_v1
- purge_risk_events_v1

## Initial State
- Scopes seeded: 9
- Rate limit configs: 12
- Active tenants: 0
- Active services: 0
- Trust profiles: 0

## Performance Baseline
- RPC avg latency: TBD
- Table sizes: All 0 bytes
- Index sizes: TBD
EOF
```

**Success Criteria:**
- ✅ Monitoring configured
- ✅ Alerts setup
- ✅ Deployment metrics logged

---

## Post-Deployment Tasks

### Immediate (Day 0)

- [ ] Announce deployment in team channel
- [ ] Update documentation with Phase 1 availability
- [ ] Enable feature flag for Phase 1 (if gated)
- [ ] Monitor error rates for 1 hour

### Short-term (Week 1)

- [ ] Setup pg_cron for retention cleanup (if self-hosted)
- [ ] Implement Redis rate limiting (currently placeholder)
- [ ] Create admin dashboard for trust profiles
- [ ] Write integration tests for delegation flow
- [ ] Document Phase 1 API for external consumers

### Medium-term (Month 1)

- [ ] Optimize trust score calculation (currently simple average)
- [ ] Add E1-E5 enforcement actions
- [ ] Implement delegation token generation in app layer
- [ ] Create trust dashboard for users
- [ ] Performance tuning based on production metrics

---

## Rollback Procedure

**Trigger:** Critical production issue directly caused by Phase 1

### Kill Switch (Instant, 0 downtime)

```sql
-- Disable all rate limiting
UPDATE rate_limit_configs SET enabled = false;

-- Disable all enforcement
UPDATE trust_profiles SET enforcement_level = 'E0';

-- Disable delegation token issuance (require manual approval)
-- (via application-level feature flag, not DB)
```

### Partial Rollback (2 min downtime)

```sql
-- Drop seed data (preserves schema)
TRUNCATE TABLE rate_limit_configs;
TRUNCATE TABLE scope_definitions;

-- Revoke grants (if needed to disable access)
REVOKE ALL ON trust_profiles FROM authenticated;
```

### Full Rollback (5 min downtime)

```sql
-- DROP in reverse dependency order
DROP FUNCTION IF EXISTS cleanup_phase1_retention_v1 CASCADE;
DROP FUNCTION IF EXISTS purge_risk_events_v1 CASCADE;
DROP FUNCTION IF EXISTS purge_service_keys_v1 CASCADE;
DROP FUNCTION IF EXISTS purge_delegation_tokens_v1 CASCADE;
DROP FUNCTION IF EXISTS issue_delegation_token_v1 CASCADE;
DROP FUNCTION IF EXISTS enforce_rate_limit_v1 CASCADE;
DROP FUNCTION IF EXISTS get_trust_tier_v1 CASCADE;
DROP FUNCTION IF EXISTS record_risk_event_v1 CASCADE;
DROP FUNCTION IF EXISTS calculate_trust_score_v1 CASCADE;
DROP FUNCTION IF EXISTS get_service_key_v1 CASCADE;
DROP FUNCTION IF EXISTS assert_service_active_v1 CASCADE;
DROP FUNCTION IF EXISTS get_user_tenant_id_v1 CASCADE;
DROP FUNCTION IF EXISTS assert_tenant_member_v1 CASCADE;
DROP FUNCTION IF EXISTS validate_scopes_v1 CASCADE;
DROP FUNCTION IF EXISTS assert_actor_context_v1 CASCADE;

DROP TABLE IF EXISTS rate_limit_configs CASCADE;
DROP TABLE IF EXISTS risk_events CASCADE;
DROP TABLE IF EXISTS trust_profiles CASCADE;
DROP TABLE IF EXISTS delegation_tokens CASCADE;
DROP TABLE IF EXISTS delegations CASCADE;
DROP TABLE IF EXISTS service_keys CASCADE;
DROP TABLE IF EXISTS service_identities CASCADE;
DROP TABLE IF EXISTS scope_definitions CASCADE;
DROP TABLE IF EXISTS tenant_members CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

DROP TYPE IF EXISTS actor_type CASCADE;
DROP TYPE IF EXISTS enforcement_level CASCADE;
DROP TYPE IF EXISTS risk_tier CASCADE;

-- Restore from backup (if data corruption occurred)
-- pg_restore backups/pre-phase1-YYYYMMDD-HHMMSS.sql
```

**After Rollback:**
- Notify stakeholders
- Investigate root cause
- Fix issues in development
- Schedule re-deployment

---

## Success Metrics

### Technical Metrics (Week 1)

- [ ] RPC error rate < 0.1%
- [ ] Avg RPC latency < 50ms
- [ ] No P0 security incidents
- [ ] Zero drift in CI checks

### Business Metrics (Month 1)

- [ ] Trust scores calculated for >50% of active users
- [ ] Rate limiting preventing >100 spam attempts/day
- [ ] Delegation tokens issued for >10 service integrations
- [ ] Zero customer-facing trust tier errors

---

## Contact Information

**Incident Commander:** [Your Name]  
**Database Admin:** [DBA Name]  
**On-Call Engineer:** [On-Call Rotation]

**Escalation:**
1. Check deployment logs
2. Review monitoring dashboards
3. Check #deployments Slack channel
4. Page on-call if P0

---

**Sign-off:**

- [ ] Technical Lead: ___________________ Date: ___________
- [ ] Security Review: ___________________ Date: ___________
- [ ] Operations: ___________________ Date: ___________

---

**Deployed:** ☐ NOT YET | ☐ IN PROGRESS | ☐ COMPLETED  
**Status:** ☐ SUCCESS | ☐ PARTIAL | ☐ ROLLED BACK
