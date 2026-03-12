$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envPath = Join-Path $repoRoot ".env.local"
$backupDir = Join-Path $repoRoot ".rollback\env"

$latestBackup = $null
if (Test-Path $backupDir) {
  $latestBackup = Get-ChildItem -Path $backupDir -Filter "env.local.*.bak" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
}

if ($latestBackup) {
  Copy-Item -Path $latestBackup.FullName -Destination $envPath -Force
  Write-Host "Restored backup: $($latestBackup.FullName)"
  Write-Host "Target: $envPath"
  exit 0
}

if (Test-Path $envPath) {
  Remove-Item -Path $envPath -Force
  Write-Host "Removed local config: $envPath"
  exit 0
}

Write-Host "Nothing to rollback. No backup and no .env.local found."
