param(
  [string]$ProjectRef = "lfkbgnbjxskspsownvjm",
  [switch]$DryRun,
  [switch]$SkipDbPush,
  [switch]$SkipFunctions,
  [string[]]$Functions = @("vk-webhook")
)

$ErrorActionPreference = "Stop"

function Resolve-SupabaseExe {
  $pinned = Join-Path $env:LOCALAPPDATA "supabase-cli\v2.75.0\supabase.exe"
  if (Test-Path $pinned) { return $pinned }
  return "supabase"
}

if (-not $env:SUPABASE_ACCESS_TOKEN -or $env:SUPABASE_ACCESS_TOKEN.Trim().Length -lt 10) {
  Write-Error "SUPABASE_ACCESS_TOKEN is not set. In PowerShell: `$env:SUPABASE_ACCESS_TOKEN='sbp_...'"
  exit 1
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..");
Push-Location $repoRoot
try {
  $supabase = Resolve-SupabaseExe

  Write-Host "==> Linking project $ProjectRef" -ForegroundColor Cyan
  & $supabase link --project-ref $ProjectRef | Out-Host

  if (-not $SkipDbPush) {
    Write-Host "==> DB push (dry-run)" -ForegroundColor Cyan
    & $supabase db push --dry-run | Out-Host

    if (-not $DryRun) {
      Write-Host "==> DB push" -ForegroundColor Cyan
      & $supabase db push | Out-Host
    }
  }

  if (-not $SkipFunctions) {
    foreach ($fn in $Functions) {
      Write-Host "==> Deploy function: $fn" -ForegroundColor Cyan
      & $supabase functions deploy $fn | Out-Host
    }
  }

  Write-Host "==> Done" -ForegroundColor Green
} finally {
  Pop-Location
}
