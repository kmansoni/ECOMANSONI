# Phase 1 Trust-lite: Quick Test Delegation Token

Write-Host "`nRunning delegation token test..." -ForegroundColor Cyan
Write-Host "Prerequisites:" -ForegroundColor DarkGray
Write-Host "  - Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY" -ForegroundColor DarkGray
Write-Host "  - Ensure TEST_USER_EMAIL / TEST_USER_PASSWORD exist in auth.users" -ForegroundColor DarkGray

node scripts/phase1/test-delegation-token.mjs
