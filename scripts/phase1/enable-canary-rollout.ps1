# Phase 1 EPIC L: Enable canary rollout (1% → 100%)
# Usage: .\enable-canary-rollout.ps1 -Percentage 1

param(
    [Parameter(Mandatory=$false)]
    [ValidateRange(0, 100)]
    [int]$Percentage = 1,

    [Parameter(Mandatory=$false)]
    [switch]$Disable
)

$ErrorActionPreference = "Stop"

# Supabase credentials
$SUPABASE_URL = "https://lfkbgnbjxskspsownvjm.supabase.co"
$SUPABASE_SERVICE_ROLE_KEY = $env:SUPABASE_SERVICE_ROLE_KEY

if (-not $SUPABASE_SERVICE_ROLE_KEY) {
    # Try to get from GitHub Secrets (for CI)
    Write-Host "⚠️  SUPABASE_SERVICE_ROLE_KEY not in environment, prompting..." -ForegroundColor Yellow
    $SUPABASE_SERVICE_ROLE_KEY = Read-Host "Enter SUPABASE_SERVICE_ROLE_KEY" -AsSecureString
    $SUPABASE_SERVICE_ROLE_KEY = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SUPABASE_SERVICE_ROLE_KEY)
    )
}

if ($Disable) {
    Write-Host "🔴 Disabling rate limit enforcement (emergency rollback)..." -ForegroundColor Red
    $Percentage = 0
    $Enabled = $false
} else {
    Write-Host "🚀 Enabling rate limit enforcement at $Percentage% rollout..." -ForegroundColor Cyan
    $Enabled = $true
}

# Execute SQL via REST API (Supabase PostgREST)
$headers = @{
    "apikey" = $SUPABASE_SERVICE_ROLE_KEY
    "Authorization" = "Bearer $SUPABASE_SERVICE_ROLE_KEY"
    "Content-Type" = "application/json"
    "Prefer" = "return=representation"
}

$body = @{
    enabled = $Enabled
    rollout_percentage = $Percentage
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod `
        -Method Patch `
        -Uri "$SUPABASE_URL/rest/v1/feature_flags?flag_name=eq.rate_limit_enforcement" `
        -Headers $headers `
        -Body $body

    Write-Host "✅ Feature flag updated:" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 3 | Write-Host

    if ($Disable) {
        Write-Host "`n✅ Rate limiting DISABLED (fail-open mode)" -ForegroundColor Green
        Write-Host "   All users will bypass rate limits." -ForegroundColor Gray
    } else {
        Write-Host "`n✅ Rate limiting ENABLED at $Percentage%" -ForegroundColor Green
        Write-Host "   $Percentage% of users will be rate-limited (hash-based bucketing)" -ForegroundColor Gray
        
        if ($Percentage -lt 100) {
            $nextStep = switch ($Percentage) {
                1 { "10" }
                10 { "25" }
                25 { "50" }
                50 { "100" }
                default { "100" }
            }
            Write-Host "`n📊 Next step: Monitor for 1 hour, then ramp to $nextStep%" -ForegroundColor Cyan
            Write-Host "   Command: .\enable-canary-rollout.ps1 -Percentage $nextStep" -ForegroundColor Gray
        } else {
            Write-Host "`n🎉 Full rollout complete (100%)!" -ForegroundColor Green
        }
    }

    Write-Host "`n📈 Monitor rate limit audits:"
    Write-Host "   https://supabase.com/dashboard/project/lfkbgnbjxskspsownvjm/editor" -ForegroundColor Gray

} catch {
    Write-Host "❌ Failed to update feature flag:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    if ($_.ErrorDetails.Message) {
        Write-Host "`nDetails:" -ForegroundColor Yellow
        $_.ErrorDetails.Message | Write-Host
    }
    
    exit 1
}
