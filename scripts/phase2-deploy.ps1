param(
  [string]$SupabaseAccessToken,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$SupabaseExePath = "C:\\Users\\manso\\AppData\\Local\\supabase-cli\\v2.75.0\\supabase.exe"

if (-not (Test-Path -LiteralPath $SupabaseExePath)) {
  Write-Error "Supabase CLI not found at: $SupabaseExePath"
  exit 1
}

# Set token
if ([string]::IsNullOrWhiteSpace($SupabaseAccessToken)) {
  $secure = Read-Host "Supabase Access Token (sbp_...)" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $SupabaseAccessToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

$env:SUPABASE_ACCESS_TOKEN = $SupabaseAccessToken

try {
  Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
  Write-Host "PHASE 2 DEPLOYMENT" -ForegroundColor Cyan
  Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
  Write-Host ""

  # Dry run first
  Write-Host "📋 Checking migrations (dry-run)..." -ForegroundColor Yellow
  & $SupabaseExePath db push --dry-run --include-all 2>&1 | Out-Host
  
  if ($DryRun) {
    Write-Host ""
    Write-Host "✓ Dry run complete. Use -DryRun:$false to execute." -ForegroundColor Green
    exit 0
  }

  Write-Host ""
  Write-Host "🚀 Deploying migrations..." -ForegroundColor Green
  & $SupabaseExePath db push --include-all --yes 2>&1 | Out-Host
  
  $lastExitCode = $LASTEXITCODE
  if ($lastExitCode -eq 0) {
    Write-Host ""
    Write-Host "✅ Phase 2 successfully deployed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Verify migrations in production:"
    Write-Host "   supabase migration list --project-ref lfkbgnbjxskspsownvjm"
    Write-Host "2. Run acceptance tests:"
    Write-Host "   npm run test:acceptance"
    Write-Host "3. Verify RLS policies active"
    Write-Host ""
  } else {
    Write-Error "Migration failed with exit code $lastExitCode"
    exit $lastExitCode
  }
} finally {
  # Clear token
  Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
}
