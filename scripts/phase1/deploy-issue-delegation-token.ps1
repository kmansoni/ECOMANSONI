# Deploy Phase 1 Trust-lite Edge Function (issue-delegation-token)
# 
# This script deploys the JWT signing Edge Function to Supabase.
# 
# Prerequisites:
# - Supabase CLI installed
# - SUPABASE_ACCESS_TOKEN environment variable or secure prompt
# - SERVICE_KEY_ENCRYPTION_SECRET configured in Supabase secrets
# 
# Usage:
#   .\scripts\phase1\deploy-issue-delegation-token.ps1

param(
    [switch]$DryRun,
    [switch]$PromptIfMissing
)

$ErrorActionPreference = "Stop"

Write-Host "`n=== Phase 1: Deploy issue-delegation-token Edge Function ===" -ForegroundColor Cyan

# Constants
$ProjectRef = "lfkbgnbjxskspsownvjm"
$FunctionName = "issue-delegation-token"
$SupabaseCli = "C:\Users\manso\AppData\Local\supabase-cli\v2.75.0\supabase.exe"

# Check Supabase CLI
if (!(Test-Path $SupabaseCli)) {
    Write-Error "Supabase CLI not found at: $SupabaseCli"
    exit 1
}

Write-Host "`nSupabase CLI: $SupabaseCli" -ForegroundColor Gray
Write-Host "Function: $FunctionName" -ForegroundColor Gray
Write-Host "Project: $ProjectRef" -ForegroundColor Gray

$AccessToken = $env:SUPABASE_ACCESS_TOKEN
$HasEnvToken = (-not [string]::IsNullOrWhiteSpace($AccessToken)) -and ($AccessToken.Trim().Length -ge 10)

if (-not $HasEnvToken) {
    Write-Host "`nWARN: SUPABASE_ACCESS_TOKEN not found in environment." -ForegroundColor Yellow
    Write-Host "      Attempting to use Supabase CLI cached login." -ForegroundColor Yellow
    Write-Host "      If deploy fails, rerun with -PromptIfMissing or set SUPABASE_ACCESS_TOKEN." -ForegroundColor Yellow

    if ($PromptIfMissing) {
        Write-Host "`nReading token from secure prompt..." -ForegroundColor Yellow
        $SecureToken = Read-Host "Enter Supabase Access Token" -AsSecureString
        $AccessToken = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureToken)
        )
        $HasEnvToken = (-not [string]::IsNullOrWhiteSpace($AccessToken)) -and ($AccessToken.Trim().Length -ge 10)
    }
}

if ($HasEnvToken) {
    Write-Host "`n✓ Access token configured (env/prompt)" -ForegroundColor Green
} else {
    Write-Host "`n✓ Using Supabase CLI cached login (no env token)" -ForegroundColor Green
}

# Dry run check
if ($DryRun) {
    Write-Host "`n[DRY RUN] Would deploy function: $FunctionName" -ForegroundColor Yellow
    Write-Host "Command: supabase functions deploy $FunctionName --project-ref $ProjectRef" -ForegroundColor Gray
    exit 0
}

# Deploy function
Write-Host "`nDeploying function..." -ForegroundColor Cyan

$previousToken = $env:SUPABASE_ACCESS_TOKEN
if ($HasEnvToken) {
    $env:SUPABASE_ACCESS_TOKEN = $AccessToken
}

try {
    & $SupabaseCli functions deploy $FunctionName --project-ref $ProjectRef --no-verify-jwt
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Function deployment failed with exit code: $LASTEXITCODE"
        exit $LASTEXITCODE
    }
    
    Write-Host "`n✅ Function deployed successfully!" -ForegroundColor Green
    
    # Display function URL
    $FunctionUrl = "https://$ProjectRef.supabase.co/functions/v1/$FunctionName"
    Write-Host "`nFunction URL:" -ForegroundColor Cyan
    Write-Host "  $FunctionUrl" -ForegroundColor White
    
    Write-Host "`nNext steps:" -ForegroundColor Yellow
    Write-Host "  1. Verify JWT_SIGNING_SECRET configured (or uses SERVICE_KEY_ENCRYPTION_SECRET)" -ForegroundColor White
    Write-Host "  2. Test with: node scripts/phase1/test-delegation-token.mjs" -ForegroundColor White
    Write-Host "  3. Monitor logs: supabase functions logs $FunctionName --project-ref $ProjectRef" -ForegroundColor White
    
} finally {
    # Restore token environment
    if ($HasEnvToken) {
        if ($previousToken) {
            $env:SUPABASE_ACCESS_TOKEN = $previousToken
        } else {
            Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
        }
    }
}
