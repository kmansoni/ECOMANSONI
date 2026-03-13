param(
  [string]$SourceDir = "",
  [string]$TargetDir = "",
  [switch]$IncludePolicyDrops,
  [switch]$IncludeSendMessageTemplate,
  [string]$MigrationSuffix = "critical_security_hardening_v1"
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if ([string]::IsNullOrWhiteSpace($SourceDir)) {
  $SourceDir = Join-Path $repoRoot 'tmp\security\generated'
}
if ([string]::IsNullOrWhiteSpace($TargetDir)) {
  $TargetDir = Join-Path $repoRoot 'supabase\migrations_hold'
}

if (-not (Test-Path -LiteralPath $SourceDir)) {
  throw "Source directory not found: $SourceDir"
}
if (-not (Test-Path -LiteralPath $TargetDir)) {
  New-Item -Path $TargetDir -ItemType Directory -Force | Out-Null
}

$required = @(
  '01_restrict_security_definer.sql',
  '02_enable_rls_public_tables.sql'
)

foreach ($name in $required) {
  $path = Join-Path $SourceDir $name
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Required generated SQL not found: $path"
  }
}

$parts = New-Object System.Collections.Generic.List[string]
$parts.Add('-- Materialized by scripts/security/materialize-critical-hardening-migration.ps1')
$parts.Add("-- Generated UTC: $((Get-Date).ToUniversalTime().ToString('yyyy-MM-dd HH:mm:ssZ'))")
$parts.Add('-- WARNING: Review this migration before applying to production.')
$parts.Add('')
$parts.Add('begin;')
$parts.Add('')

function Append-Section([System.Collections.Generic.List[string]]$buffer, [string]$sectionTitle, [string]$filePath) {
  $buffer.Add("-- ===== $sectionTitle =====")
  $buffer.AddRange([string[]](Get-Content -LiteralPath $filePath -Encoding UTF8))
  $buffer.Add('')
}

Append-Section -buffer $parts -sectionTitle 'PHASE 0A: SECURITY DEFINER LOCKDOWN' -filePath (Join-Path $SourceDir '01_restrict_security_definer.sql')
Append-Section -buffer $parts -sectionTitle 'PHASE 0B: ENABLE RLS ON PUBLIC TABLES' -filePath (Join-Path $SourceDir '02_enable_rls_public_tables.sql')

if ($IncludePolicyDrops) {
  $policyPath = Join-Path $SourceDir '03_drop_true_policies_candidates.sql'
  if (-not (Test-Path -LiteralPath $policyPath)) {
    throw "Requested policy drop section but file missing: $policyPath"
  }
  Append-Section -buffer $parts -sectionTitle 'PHASE 1: DROP TRUE POLICIES (REVIEWED)' -filePath $policyPath
}

if ($IncludeSendMessageTemplate) {
  $sendPath = Join-Path $SourceDir '04_send_message_v1_canonicalization_template.sql'
  if (-not (Test-Path -LiteralPath $sendPath)) {
    throw "Requested send_message section but file missing: $sendPath"
  }
  Append-Section -buffer $parts -sectionTitle 'PHASE 1B: SEND_MESSAGE_V1 CANONICALIZATION' -filePath $sendPath
}

$parts.Add('commit;')

$timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss')
$fileName = "${timestamp}_${MigrationSuffix}.sql"
$targetPath = Join-Path $TargetDir $fileName
Set-Content -LiteralPath $targetPath -Encoding UTF8 -Value $parts

Write-Host "Migration materialized: $targetPath" -ForegroundColor Green
exit 0
