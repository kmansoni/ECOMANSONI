# Global Deploy Plan (2026-03-26)

## Scope
Production deployment for frontend + Supabase schema/functions with strict gates.

## 0. Preconditions
- Branch is up to date with remote.
- Supabase project ref is correct.
- SUPABASE_ACCESS_TOKEN is available (or secure prompt mode is used).
- Required secrets exist in CI and local environment.

## 1. Local Preflight (must pass)
1. Typecheck:
   - npm run typecheck
2. SQL governance:
   - npm run sql:lint
   - npm run migrations:lint
3. Basic test smoke:
   - npm test
4. Optional hard gates:
   - npm run check:backend
   - npm run calls:validate

## 2. Migration Safety
1. Ensure no duplicate migration versions:
   - npm run migrations:lint
2. Confirm local/remote sync guard before deploy:
   - run scripts/sync-guard.ps1 (or via deploy wrapper)
3. Run DB push dry-run first:
   - scripts/supabase-db-push.ps1 -DryRun -Yes
4. If dry-run is clean, run apply:
   - scripts/supabase-db-push.ps1 -Yes

## 3. Function Deploy Sequence
Deploy functions in controlled order:
1. vk-webhook
2. turn-credentials
3. aria-chat
4. insurance-assistant
5. property-assistant

Use wrapper:
- scripts/supabase-deploy.ps1 -PromptToken

## 4. Recommended One-Command Path
Use guarded deploy wrapper:
- pwsh -NoProfile -ExecutionPolicy Bypass -File ./scripts/supabase-deploy.ps1 -PromptToken

This wrapper already performs:
- DB push policy guard
- Optional critical security gate
- E2EE guard and version check
- Sync guard before and after link
- DB push dry-run and apply
- Function deploy loop

## 5. Post-Deploy Verification
1. Migration status:
   - scripts/supabase-migration-list.ps1
2. Targeted runtime checks:
   - auth OTP send/verify
   - chat send/read flow
   - channel/group message realtime
   - secret chat handshake path
3. Frontend build sanity:
   - npm run build

## 6. Rollback/Containment
If any stage fails:
1. Stop pipeline immediately.
2. Do not continue function deploy if DB push failed.
3. Capture failing command output and migration version.
4. Prepare forward-fix migration instead of destructive rollback.

## 7. Release Decision
Release only when all are true:
- typecheck: pass
- sql:lint: pass
- migrations:lint: pass
- db push dry-run/apply: pass
- function deploy: pass
- post-deploy checks: pass
