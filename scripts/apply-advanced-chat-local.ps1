param(
  [switch]$NoBackup
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envPath = Join-Path $repoRoot ".env.local"
$backupDir = Join-Path $repoRoot ".rollback\env"

if (-not $NoBackup -and (Test-Path $envPath)) {
  New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $backupPath = Join-Path $backupDir ("env.local.{0}.bak" -f $stamp)
  Copy-Item -Path $envPath -Destination $backupPath -Force
  Write-Host "Backup created: $backupPath"
}

$content = @'
# Managed by scripts/apply-advanced-chat-local.ps1
# Remove or edit only if you intentionally change local chat/calls behavior.

# Force advanced chat protocol for all local users
VITE_CHAT_PROTOCOL_V11="true"
VITE_CHAT_PROTOCOL_V11_ROLLOUT_PERCENT="100"

# Keep Calls V2 enabled locally
VITE_CALLS_V2_ENABLED="true"
'@

Set-Content -Path $envPath -Value $content -Encoding UTF8

Write-Host "Applied advanced local config: $envPath"
Write-Host "Rollback: pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/rollback-advanced-chat-local.ps1"
