# Supabase + Email Router Recovery Runbook

## Goal
Restore full email-router flow when blocked by secrets, DB auth, migrations, or stale local process env.

## 1) One-time secrets setup (Windows, no chat paste)
- Preferred (prompts once and saves to User env + current session):
  - `pwsh -NoProfile -ExecutionPolicy Bypass -File ./scripts/setup-supabase-secrets.ps1 -PromptServiceRole -PromptDbPassword -PromptAccessToken`

- Manual alternative:
  - `setx SUPABASE_URL "https://lfkbgnbjxskspsownvjm.supabase.co"`
  - `setx SUPABASE_SERVICE_ROLE_KEY "<service_role_jwt>"`
  - `setx SUPABASE_DB_PASSWORD "<db_password>"`
  - `setx SUPABASE_ACCESS_TOKEN "sbp_..."`

Open a new terminal after `setx`.

## 2) Validate effective env (no secret output)
- `pwsh -NoProfile -Command "$u=[Environment]::GetEnvironmentVariable('SUPABASE_URL','User'); $k=[Environment]::GetEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY','User'); \"url_set=$(-not [string]::IsNullOrWhiteSpace($u)) key_len=$([string]::IsNullOrWhiteSpace($k)?0:$k.Length)\""`

## 3) Apply migrations (preferred order)
### 3A. Standard path (`db push`)
- `pwsh -NoProfile -ExecutionPolicy Bypass -File ./scripts/supabase-db-push.ps1 -Yes`

If this fails with `SQLSTATE 28P01` (wrong Postgres password), either fix `SUPABASE_DB_PASSWORD` or use 3B.

### 3B. Fallback path (Management API, no Postgres password)
- `pwsh -NoProfile -ExecutionPolicy Bypass -File ./scripts/apply-migration-via-api.ps1 -MigrationFile ./supabase/migrations/20260228183000_email_router_inbound_inbox.sql -ProjectRef lfkbgnbjxskspsownvjm`
- `pwsh -NoProfile -ExecutionPolicy Bypass -File ./scripts/apply-migration-via-api.ps1 -MigrationFile ./supabase/migrations/20260228190000_email_router_threads_and_read_state.sql -ProjectRef lfkbgnbjxskspsownvjm`

## 4) Restart local email-router with fresh env
- `pwsh -NoProfile -Command "$conn=Get-NetTCPConnection -LocalPort 8090 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if($conn){ Stop-Process -Id $conn.OwningProcess -Force }; $env:SUPABASE_URL=[Environment]::GetEnvironmentVariable('SUPABASE_URL','User'); $env:SUPABASE_SERVICE_ROLE_KEY=[Environment]::GetEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY','User'); npm --prefix ./services/email-router run dev"`

## 5) End-to-end smoke
- `pwsh -NoProfile -ExecutionPolicy Bypass -File ./scripts/email-router-smoke.ps1 -BaseUrl http://127.0.0.1:8090 -Mailbox support@example.com -From customer@example.com -OutboundTo user@example.com`

Expected: all steps return `ok: true`.

## 6) Known failure signatures and fixes
- `role=anon` used as service key:
  - Replace with `service_role` JWT in `SUPABASE_SERVICE_ROLE_KEY`.
- `SQLSTATE 28P01` during `db push`:
  - Wrong DB password; fix/reset at Supabase Database settings.
- `syntax error at or near "$"` in migration:
  - Invalid `DO $` block delimiter; use `DO $$ ... $$;`.
- `RLS policy violation` from local service after secret fix:
  - Restart local email-router process to pick up fresh env.
