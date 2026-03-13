param(
  [string]$ProjectRef = "",
  [switch]$FailOnCritical,
  [string]$OutputDir = ""
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $OutputDir = Join-Path $repoRoot 'tmp\security\generated'
}

$auditScript = Join-Path $PSScriptRoot 'supabase-critical-audit.ps1'
$generateScript = Join-Path $PSScriptRoot 'supabase-generate-hardening-sql.ps1'

if (-not (Test-Path -LiteralPath $auditScript)) {
  throw "Audit script not found: $auditScript"
}
if (-not (Test-Path -LiteralPath $generateScript)) {
  throw "Generator script not found: $generateScript"
}

Write-Host 'Step 1/2: Running critical Supabase security audit...' -ForegroundColor Cyan
if ($FailOnCritical) {
  & $auditScript -ProjectRef $ProjectRef -OutputDir $OutputDir -FailOnCritical
} else {
  & $auditScript -ProjectRef $ProjectRef -OutputDir $OutputDir
}
if ($LASTEXITCODE -ne 0) {
  throw "Critical audit failed with exit code $LASTEXITCODE"
}

Write-Host 'Step 2/2: Generating hardening SQL templates...' -ForegroundColor Cyan
& $generateScript -OutputDir $OutputDir
if ($LASTEXITCODE -ne 0) {
  throw "Hardening SQL generation failed with exit code $LASTEXITCODE"
}

Write-Host ''
Write-Host 'Hardening artifacts are ready:' -ForegroundColor Green
Write-Host " - $(Join-Path $OutputDir 'critical-audit.json')"
Write-Host " - $(Join-Path $OutputDir 'critical-audit.md')"
Write-Host " - $(Join-Path $OutputDir '01_restrict_security_definer.sql')"
Write-Host " - $(Join-Path $OutputDir '02_enable_rls_public_tables.sql')"
Write-Host " - $(Join-Path $OutputDir '03_drop_true_policies_candidates.sql')"
Write-Host " - $(Join-Path $OutputDir '04_send_message_v1_canonicalization_template.sql')"

exit 0
