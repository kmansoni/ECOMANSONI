param(
  [Parameter(Mandatory = $true)]
  [string]$DbUrl,

  [string]$OutDir = "./.tmp/supabase-backups",

  [string]$BackupName = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($DbUrl)) {
  throw "DbUrl is required."
}

if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
  throw "pg_dump is not available in PATH. Install PostgreSQL client tools."
}

if ([string]::IsNullOrWhiteSpace($BackupName)) {
  $BackupName = (Get-Date -Format "yyyyMMdd-HHmmss")
}

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

$dumpPath = Join-Path $OutDir "supabase-$BackupName.dump"
$hashPath = "$dumpPath.sha256"

pg_dump $DbUrl -Fc -f $dumpPath

$hash = Get-FileHash -Algorithm SHA256 $dumpPath
$hash.Hash | Out-File $hashPath -Encoding ascii

Write-Host "Backup created: $dumpPath"
Write-Host "Checksum created: $hashPath"
