param(
  [string]$ProjectRef = "",
  [string[]]$Functions = @("trends-worker", "trends-run")
)

$ErrorActionPreference = "Stop"

function Resolve-SupabaseExe {
  $pinned = Join-Path $env:LOCALAPPDATA "supabase-cli\v2.75.0\supabase.exe"
  if (Test-Path $pinned) { return $pinned }
  return "supabase"
}

function Resolve-ProjectRef([string]$PreferredRef) {
  if (-not [string]::IsNullOrWhiteSpace($PreferredRef)) { return $PreferredRef.Trim() }
  if (-not [string]::IsNullOrWhiteSpace($env:SUPABASE_PROJECT_REF)) { return $env:SUPABASE_PROJECT_REF.Trim() }

  $url = $env:SUPABASE_URL
  if ([string]::IsNullOrWhiteSpace($url)) { $url = $env:VITE_SUPABASE_URL }
  if (-not [string]::IsNullOrWhiteSpace($url)) {
    $m = [regex]::Match($url.Trim(), 'https?://([a-z0-9-]+)\.supabase\.co/?')
    if ($m.Success) { return $m.Groups[1].Value }
  }
  throw "Project ref is missing. Set -ProjectRef or SUPABASE_PROJECT_REF (or SUPABASE_URL/VITE_SUPABASE_URL)."
}

if (-not $env:SUPABASE_ACCESS_TOKEN -or $env:SUPABASE_ACCESS_TOKEN.Trim().Length -lt 10) {
  Write-Host "WARN: SUPABASE_ACCESS_TOKEN is not set. Attempting to use Supabase CLI cached login." -ForegroundColor Yellow
  Write-Host "      If link/deploy fails, set it in this shell: `$env:SUPABASE_ACCESS_TOKEN='sbp_...'" -ForegroundColor Yellow
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..");
Push-Location $repoRoot
try {
  $supabase = Resolve-SupabaseExe
  $resolvedProjectRef = Resolve-ProjectRef $ProjectRef

  Write-Host "==> Linking project $resolvedProjectRef" -ForegroundColor Cyan
  & $supabase link --project-ref $resolvedProjectRef | Out-Host

  foreach ($fn in $Functions) {
    Write-Host "==> Deploy function: $fn" -ForegroundColor Cyan
    & $supabase functions deploy $fn | Out-Host
  }

  Write-Host "==> Done" -ForegroundColor Green
} finally {
  Pop-Location
}
