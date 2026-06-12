# Migration Remediation Report (2026-03-24)

## Scope

This report summarizes the migration audit/remediation cycle completed on 2026-03-24 for Supabase/PostgreSQL schema management, with focus on:

- migration conflict elimination;
- timeout-safe deployment execution;
- idempotent SQL migration behavior;
- orphan cleanup before FK validation;
- proof of final consistency (local vs remote).

## Executive Result

All blocking migration/deployment issues were resolved.

Final state:

- pending migrations: 0;
- local/remote migration drift: 0;
- targeted FK constraints: validated;
- sampled orphan counters: 0;
- sync guard: passed.

## Root Causes Found

1. Duplicate migration version prefixes
- Multiple migration files reused the same timestamp/version prefixes.
- This caused ordering conflicts and apply failures in remote environments.

2. Unstable direct CLI migration-list path under network pressure
- Intermittent timeout/EOF/SASL-like transport failures blocked reliable checks.

3. Non-idempotent policy creation in some SQL migrations
- Policy creation without safe drop/existence guard failed on re-apply/drifted states.

4. Incorrect schema references in some migrations
- Example pattern: references to outdated or mismatched tables/columns.

5. Legacy orphan rows blocking FK validation
- Existing orphaned references prevented immediate FK validation when constraints were added.

## Remediation Applied

### A) Deployment reliability hardening

1. Hardened migration-list wrapper with retries and fallback:
- file: scripts/supabase-migration-list.ps1
- Added:
  - configurable retries and retry delay;
  - secure DB password prompt mode;
  - management API fallback when CLI path fails;
  - environment variable restoration/cleanup after run.

2. Updated VS Code tasks to use resilient wrapper:
- file: .vscode/tasks.json
- Migration-list tasks now execute wrapper with retry params and secure-prompt mode where required.

### B) Migration conflict elimination (unique version chain)

Duplicate migration versions were replaced with unique, monotonic versions by renaming/remapping files.

Representative resulting files:

- supabase/migrations/20260307000010_fix_auth_tables_rls_and_telemetry_partitions.sql
- supabase/migrations/20260308000013_add_missing_fk_constraints.sql
- supabase/migrations/20260308000014_settings_missing_features.sql
- supabase/migrations/20260308000015_message_delivery_edit_history.sql
- supabase/migrations/20260308000016_note_reactions.sql
- supabase/migrations/20260308000017_ranked_feed_v2.sql
- supabase/migrations/20260309000011_nav_driver_activation_guard.sql
- supabase/migrations/20260309000012_email_smtp_settings.sql
- supabase/migrations/20260311000004_instagram_parity_features.sql
- supabase/migrations/20260311000005_live_shopping_drag_reorder.sql

### C) Migration content corrections discovered during apply

1. FK rollout safety (legacy data tolerant)
- file: supabase/migrations/20260308000013_add_missing_fk_constraints.sql
- FK adds switched to NOT VALID to avoid immediate hard-fail on historical orphan data.

2. Idempotent policy recreation
- file: supabase/migrations/20260308000016_note_reactions.sql
- Added DROP POLICY IF EXISTS before creating policies.

3. Admin key reference fix
- file: supabase/migrations/20260309000012_email_smtp_settings.sql
- Corrected admin check key usage to match actual schema.

4. Messaging participant table fix
- file: supabase/migrations/20260311000004_instagram_parity_features.sql
- Replaced outdated conversation_members references with public.conversation_participants.

### D) Dedicated orphan-cleanup + FK-validation migration

Created and applied:

- supabase/migrations/20260324090000_validate_fk_after_orphan_cleanup.sql

What it does:

1. Removes/normalizes orphan references in affected tables.
2. Validates previously NOT VALID FK constraints.

Important adjustment during first apply attempt:

- orphan notifications with invalid actor references were deleted (not nulled), because actor_id behavior was effectively non-null constrained in this environment.

## Validation Evidence

### 1) Sync guard

Command outcome:

- sync-guard remote migration check passed;
- issues count: 0.

### 2) Migration apply state

- pending migrations were reduced to 0;
- cleanup/validation migration applied successfully.

### 3) Orphan counters (sample set)

Post-fix sampled counters returned 0 for key entities, including:

- posts author orphans;
- stories author orphans;
- reels author orphans;
- notifications user/actor orphans;
- likes-related user orphans.

### 4) FK validation status

Target constraints reported as validated=true after cleanup/validate migration.

## Files Touched (Primary)

- scripts/supabase-migration-list.ps1
- .vscode/tasks.json
- supabase/migrations/20260308000013_add_missing_fk_constraints.sql
- supabase/migrations/20260308000016_note_reactions.sql
- supabase/migrations/20260309000012_email_smtp_settings.sql
- supabase/migrations/20260311000004_instagram_parity_features.sql
- supabase/migrations/20260324090000_validate_fk_after_orphan_cleanup.sql

## Operational Outcome

The migration pipeline is now conflict-free, timeout-resilient, and data-integrity-safe for the addressed scope.

Remaining risk level for this scope is low, with primary residual risk tied to future manual migration additions that reuse existing version prefixes or skip idempotence patterns.

## Recommended Guardrails (Next)

1. Keep strict monotonic migration naming validation in CI.
2. Add pre-merge linter checks for:
- duplicate migration versions;
- non-idempotent policy creation;
- known stale table references.
3. Run periodic orphan-drift probes before enabling new strict FKs.
4. Preserve API fallback path for critical migration-list/status operations in unstable networks.
