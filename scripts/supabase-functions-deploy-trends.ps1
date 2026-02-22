param(
  [string]$ProjectRef = "lfkbgnbjxskspsownvjm",
  [string[]]$Functions = @("trends-worker", "trends-run")
)

$ErrorActionPreference = "Stop"

function Resolve-SupabaseExe {
  $pinned = Join-Path $env:LOCALAPPDATA "supabase-cli\v2.75.0\supabase.exe"
  if (Test-Path $pinned) { return $pinned }
  return "supabase"
}

if (-not $env:SUPABASE_ACCESS_TOKEN -or $env:SUPABASE_ACCESS_TOKEN.Trim().Length -lt 10) {
  Write-Host "WARN: SUPABASE_ACCESS_TOKEN is not set. Attempting to use Supabase CLI cached login." -ForegroundColor Yellow
  Write-Host "      If link/deploy fails, set it in this shell: `$env:SUPABASE_ACCESS_TOKEN='sbp_...'" -ForegroundColor Yellow
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..");
Push-Location $repoRoot
try {
  $supabase = Resolve-SupabaseExe

  Write-Host "==> Linking project $ProjectRef" -ForegroundColor Cyan
  & $supabase link --project-ref $ProjectRef | Out-Host

  foreach ($fn in $Functions) {
    Write-Host "==> Deploy function: $fn" -ForegroundColor Cyan
    & $supabase functions deploy $fn | Out-Host
  }

  Write-Host "==> Done" -ForegroundColor Green
} finally {
  Pop-Location
}
