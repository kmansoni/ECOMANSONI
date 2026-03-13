param(
  [string]$ProjectRef = "",
  [switch]$DryRun,
  [switch]$SkipDbPush,
  [switch]$SkipFunctions,
  [switch]$SkipSyncGuard,
  [switch]$SkipE2EEChecks,
  [switch]$RunCriticalSecurityAudit,
  [switch]$EnforceCriticalSecurityGate,
  [string]$MirrorRepoPath = "",
  [switch]$PromptToken,
  [string[]]$Functions = @("vk-webhook", "turn-credentials", "aria-chat", "insurance-assistant", "property-assistant")
)

$ErrorActionPreference = "Stop"

function Resolve-SupabaseExe {
  if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
    $pinned = Join-Path $env:LOCALAPPDATA "supabase-cli\v2.75.0\supabase.exe"
    if (Test-Path $pinned) { return $pinned }
  }

  $supabaseCmd = Get-Command supabase -ErrorAction SilentlyContinue
  if ($null -ne $supabaseCmd -and -not [string]::IsNullOrWhiteSpace($supabaseCmd.Source)) {
    return $supabaseCmd.Source
  }

  return "supabase"
}

function Resolve-ProjectRef([string]$PreferredRef) {
  if (-not [string]::IsNullOrWhiteSpace($PreferredRef)) { return $PreferredRef.Trim() }
  if (-not [string]::IsNullOrWhiteSpace($env:SUPABASE_PROJECT_REF)) { return $env:SUPABASE_PROJECT_REF.Trim() }

  $configPath = Join-Path (Join-Path $PSScriptRoot "..") "supabase\config.toml"
  if (Test-Path -LiteralPath $configPath) {
    $projectIdLine = Get-Content -LiteralPath $configPath | Where-Object { $_ -match '^\s*project_id\s*=\s*"([a-z0-9-]+)"\s*$' } | Select-Object -First 1
    if (-not [string]::IsNullOrWhiteSpace($projectIdLine)) {
      $m = [regex]::Match($projectIdLine, '^\s*project_id\s*=\s*"([a-z0-9-]+)"\s*$')
      if ($m.Success) { return $m.Groups[1].Value }
    }
  }

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

function Assert-LastExitCode([string]$stepName) {
  if ($LASTEXITCODE -ne 0) {
    throw "$stepName failed with exit code $LASTEXITCODE"
  }
}

function Get-LinkedProjectRef([string]$repoRootPath) {
  $linkedRefPath = Join-Path (Join-Path $repoRootPath "supabase") ".temp\project-ref"
  if (-not (Test-Path -LiteralPath $linkedRefPath)) {
    return ""
  }
  try {
    return (Get-Content -LiteralPath $linkedRefPath -Raw).Trim()
  } catch {
    return ""
  }
}

function Invoke-DbPushPolicyGuard([string]$repoRootPath) {
  $guardScript = Join-Path $PSScriptRoot "supabase-db-push-policy-guard.ps1"
  if (-not (Test-Path -LiteralPath $guardScript)) {
    throw "DB push policy guard script not found: $guardScript"
  }

  & $guardScript -RepoRoot $repoRootPath | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "DB push policy guard failed with exit code $LASTEXITCODE"
  }
}

$previousToken = $env:SUPABASE_ACCESS_TOKEN
$tokenWasSet = -not [string]::IsNullOrWhiteSpace($previousToken)
$needsPrompt = $PromptToken -and ((-not $tokenWasSet) -or ($previousToken.Trim().Length -lt 10))
$previousPgPassword = $env:PGPASSWORD
$previousSupabaseDbPassword = $env:SUPABASE_DB_PASSWORD

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..");
Push-Location $repoRoot
try {
  if ($needsPrompt) {
    $env:SUPABASE_ACCESS_TOKEN = Read-SupabaseToken
  } elseif (-not $tokenWasSet) {
    Write-Host "SUPABASE_ACCESS_TOKEN is not set; using Supabase CLI cached login if available." -ForegroundColor Yellow
  }

  $supabase = Resolve-SupabaseExe
  $resolvedProjectRef = Resolve-ProjectRef $ProjectRef

  Invoke-DbPushPolicyGuard -repoRootPath $repoRoot

  if ($RunCriticalSecurityAudit -or $EnforceCriticalSecurityGate) {
    $criticalAuditRunner = Join-Path $PSScriptRoot "security\supabase-critical-hardening-runner.ps1"
    if (-not (Test-Path -LiteralPath $criticalAuditRunner)) {
      throw "Critical security audit runner not found: $criticalAuditRunner"
    }

    Write-Host "==> Critical Supabase security audit" -ForegroundColor Cyan
    if ($EnforceCriticalSecurityGate) {
      & $criticalAuditRunner -ProjectRef $resolvedProjectRef -FailOnCritical
      Assert-LastExitCode "critical security gate"
    } else {
      & $criticalAuditRunner -ProjectRef $resolvedProjectRef
      Assert-LastExitCode "critical security audit"
    }
  }

  if (-not $SkipE2EEChecks) {
    $e2eeGuardScript = Join-Path $PSScriptRoot "e2ee-guard.ps1"
    if (-not (Test-Path -LiteralPath $e2eeGuardScript)) {
      throw "E2EE guard script not found: $e2eeGuardScript"
    }
    & $e2eeGuardScript -RepoRoot $repoRoot
    if (-not $?) {
      throw "E2EE guard failed."
    }
  }

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
      Write-Host "Sync guard failed. Deploy stopped." -ForegroundColor Red
      # Only block if issues are present (sync-guard.ps1 already checks)
      exit 1
    }
  }

  Write-Host "==> Linking project $resolvedProjectRef" -ForegroundColor Cyan
  & $supabase link --project-ref $resolvedProjectRef | Out-Host
  if ($LASTEXITCODE -ne 0) {
    $alreadyLinkedRef = Get-LinkedProjectRef $repoRoot
    if ($alreadyLinkedRef -eq $resolvedProjectRef) {
      Write-Host "supabase link failed, but project is already linked locally ($alreadyLinkedRef). Continuing." -ForegroundColor Yellow
    } else {
      Assert-LastExitCode "supabase link"
    }
  }

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
      Write-Host "Sync guard failed after link. Deploy stopped." -ForegroundColor Red
      # Only block if issues are present (sync-guard.ps1 already checks)
      exit 1
    }
  }

  if (-not $SkipDbPush) {
    $dbPushScript = Join-Path $PSScriptRoot "supabase-db-push.ps1"
    if (-not (Test-Path -LiteralPath $dbPushScript)) {
      throw "DB push wrapper script not found: $dbPushScript"
    }

    Write-Host "==> DB push (dry-run via resilient wrapper)" -ForegroundColor Cyan
    & $dbPushScript -DryRun -Yes -SupabaseExePath $supabase | Out-Host
    Assert-LastExitCode "supabase-db-push.ps1 -DryRun"

    if (-not $DryRun) {
      Write-Host "==> DB push (apply via resilient wrapper)" -ForegroundColor Cyan
      & $dbPushScript -Yes -SupabaseExePath $supabase | Out-Host
      Assert-LastExitCode "supabase-db-push.ps1"
    }
  }

  if (-not $SkipFunctions) {
    foreach ($fn in $Functions) {
      Write-Host "==> Deploy function: $fn" -ForegroundColor Cyan
      & $supabase functions deploy $fn | Out-Host
      Assert-LastExitCode "supabase functions deploy $fn"
    }
  }

  if (-not $SkipE2EEChecks) {
    $e2eeCheckScript = Join-Path $PSScriptRoot "e2ee-version-check.ps1"
    if (-not (Test-Path -LiteralPath $e2eeCheckScript)) {
      throw "E2EE version check script not found: $e2eeCheckScript"
    }
    & $e2eeCheckScript -ProjectRef $resolvedProjectRef
    if (-not $?) {
      throw "E2EE version check failed."
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
  if ($null -eq $previousPgPassword) {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  } else {
    $env:PGPASSWORD = $previousPgPassword
  }
  if ($null -eq $previousSupabaseDbPassword) {
    Remove-Item Env:SUPABASE_DB_PASSWORD -ErrorAction SilentlyContinue
  } else {
    $env:SUPABASE_DB_PASSWORD = $previousSupabaseDbPassword
  }
  Pop-Location
}
