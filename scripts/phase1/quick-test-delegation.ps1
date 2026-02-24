# Phase 1 Trust-lite: Quick Test Delegation Token

# Create test user (if not exists)
Write-Host "`nCreating test user..." -ForegroundColor Cyan

$CreateUserUrl = "https://lfkbgnbjxskspsownvjm.supabase.co/functions/v1/create-test-user"
$CreateUserBody = @{
    email = "test-delegations@example.com"
    password = "test-password-123"
    display_name = "Test Delegation User"
} | ConvertTo-Json

$env:VITE_SUPABASE_URL = "https://lfkbgnbjxskspsownvjm.supabase.co"
$env:VITE_SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxma2JnbmJqeHNrc3Bzb3dudmptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzYxODMwOTUsImV4cCI6MjA1MTc1OTA5NX0.K_nQ3qZqKvz7z7z7z7z7z7z7z7z7z7z7z7z7z7"

try {
    $Response = Invoke-RestMethod -Uri $CreateUserUrl -Method POST -Body $CreateUserBody -ContentType "application/json" -ErrorAction SilentlyContinue
    Write-Host "✓ Test user created" -ForegroundColor Green
} catch {
    Write-Host "⚠ Test user already exists or creation failed (OK)" -ForegroundColor Yellow
}

# Run full test
Write-Host "`nRunning delegation token test..." -ForegroundColor Cyan
node scripts/phase1/test-delegation-token.mjs
