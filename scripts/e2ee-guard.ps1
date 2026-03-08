param(
  [string]$RepoRoot = "",
  [string[]]$MigrationFiles = @(),
  [switch]$AllowDestructive
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

$migrationsRoot = Join-Path $RepoRoot 'supabase\migrations'
if (-not (Test-Path -LiteralPath $migrationsRoot)) {
  throw "Migrations folder not found: $migrationsRoot"
}

$requiredMigrations = @(
  '20260303150000_e2ee_schema_alignment_v2.sql',
  '20260304060000_e2ee_disable_encryption_rpc.sql',
  '20260304103000_e2ee_enable_encryption_rpc.sql'
)

$knownSafeDestructiveMigrations = @(
  '20260303150000_e2ee_schema_alignment_v2.sql',
  '20260304060000_e2ee_disable_encryption_rpc.sql'
)

$missing = @()
foreach ($required in $requiredMigrations) {
  $full = Join-Path $migrationsRoot $required
  if (-not (Test-Path -LiteralPath $full)) {
    $missing += $required
  }
}

if ($missing.Count -gt 0) {
  throw ("E2EE guard failed: required migrations are missing: " + ($missing -join ', '))
}

if ($MigrationFiles.Count -gt 0) {
  $filesToScan = @()
  foreach ($f in $MigrationFiles) {
    $candidate = Join-Path $migrationsRoot $f
    if (Test-Path -LiteralPath $candidate) {
      $filesToScan += $candidate
    }
  }
} else {
  $filesToScan = Get-ChildItem -LiteralPath $migrationsRoot -File -Filter '*.sql' | Select-Object -ExpandProperty FullName
}

$dangerousFindings = @()
$allowDestructiveByEnv = ($env:E2EE_GUARD_ALLOW_DESTRUCTIVE -eq '1')
$allowDestructiveEffective = $AllowDestructive -or $allowDestructiveByEnv

foreach ($path in $filesToScan) {
  $name = [System.IO.Path]::GetFileName($path)
  $content = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  if ([string]::IsNullOrWhiteSpace($content)) {
    # Some environments can return null/empty on transient file-read issues.
    # Empty SQL cannot be destructive for E2EE tables, so skip safely.
    continue
  }
  $normalized = $content.ToLowerInvariant()

  $touchesE2EE = (
    $normalized.Contains('chat_encryption_keys') -or
    $normalized.Contains('user_encryption_keys') -or
    $normalized.Contains('enable_conversation_encryption') -or
    $normalized.Contains('disable_conversation_encryption') -or
    $normalized.Contains('encryption_enabled')
  )

  if (-not $touchesE2EE) { continue }

  $hasDestructive = (
    ($normalized -match '\bdrop\s+table\b') -or
    ($normalized -match '\btruncate\s+table\b') -or
    ($normalized -match '\bdrop\s+function\b') -or
    ($normalized -match '\balter\s+table\s+public\.(chat_encryption_keys|user_encryption_keys)\s+drop\s+column\b') -or
    ($normalized -match '\bdelete\s+from\s+public\.(chat_encryption_keys|user_encryption_keys)\b')
  )

  if (-not $hasDestructive) { continue }

  if ($name -in $knownSafeDestructiveMigrations) { continue }

  $dangerousFindings += $name
}

if ($dangerousFindings.Count -gt 0 -and -not $allowDestructiveEffective) {
  throw (
    "E2EE guard blocked potentially destructive SQL in: " + ($dangerousFindings -join ', ') +
    ". Set E2EE_GUARD_ALLOW_DESTRUCTIVE=1 (or pass -AllowDestructive) only if intentional."
  )
}

Write-Host 'E2EE guard passed.' -ForegroundColor Green
