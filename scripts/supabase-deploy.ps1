param(
  [string]$ProjectRef = "",
  [switch]$DryRun,
  [switch]$SkipDbPush,
  [switch]$SkipFunctions,
  [switch]$SkipSyncGuard,
  [string]$MirrorRepoPath = "",
  [string[]]$Functions = @("vk-webhook", "turn-credentials")
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

function Read-SupabaseToken {
  $secure = Read-Host "Supabase access token (sbp_...)" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }

  if ([string]::IsNullOrWhiteSpace($token)) {
    throw "Access token is empty."
  }
  return $token
}

$previousToken = $env:SUPABASE_ACCESS_TOKEN
$tokenWasSet = -not [string]::IsNullOrWhiteSpace($previousToken)
$needsPrompt = (-not $tokenWasSet) -or ($previousToken.Trim().Length -lt 10)

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..");
Push-Location $repoRoot
try {
  if ($needsPrompt) {
    $env:SUPABASE_ACCESS_TOKEN = Read-SupabaseToken
  }

  $supabase = Resolve-SupabaseExe
  $resolvedProjectRef = Resolve-ProjectRef $ProjectRef

  if (-not $SkipSyncGuard) {
    $syncGuardScript = Join-Path $PSScriptRoot "sync-guard.ps1"
    if (-not (Test-Path $syncGuardScript)) {
      throw "Sync guard script not found: $syncGuardScript"
    }
    $mirror = $MirrorRepoPath
    if ([string]::IsNullOrWhiteSpace($mirror)) {
      $mirror = $env:SYNC_GUARD_MIRROR_PATH
    }

    if ([string]::IsNullOrWhiteSpace($mirror)) {
      & $syncGuardScript -SupabaseExe $supabase
    } else {
      & $syncGuardScript -SupabaseExe $supabase -MirrorRepoPath $mirror
    }
    if ($LASTEXITCODE -ne 0) {
      throw "Sync guard failed. Deploy stopped."
    }
  }

  Write-Host "==> Linking project $resolvedProjectRef" -ForegroundColor Cyan
  & $supabase link --project-ref $resolvedProjectRef | Out-Host

  if (-not $SkipSyncGuard) {
    $syncGuardScript = Join-Path $PSScriptRoot "sync-guard.ps1"
    $mirror = $MirrorRepoPath
    if ([string]::IsNullOrWhiteSpace($mirror)) {
      $mirror = $env:SYNC_GUARD_MIRROR_PATH
    }

    if ([string]::IsNullOrWhiteSpace($mirror)) {
      & $syncGuardScript -SupabaseExe $supabase -CheckRemoteMigrations
    } else {
      & $syncGuardScript -SupabaseExe $supabase -CheckRemoteMigrations -MirrorRepoPath $mirror
    }
    if ($LASTEXITCODE -ne 0) {
      throw "Sync guard failed after link. Deploy stopped."
    }
  }

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
  if ($needsPrompt) {
    Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
    if ($tokenWasSet) {
      $env:SUPABASE_ACCESS_TOKEN = $previousToken
    }
  }
  Pop-Location
}
