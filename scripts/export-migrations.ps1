param(
  [string]$MigrationsDir = (Join-Path $PSScriptRoot "..\supabase\migrations"),
  [string]$OutputFile = (Join-Path $PSScriptRoot "..\supabase\.temp\all-migrations.sql")
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $MigrationsDir)) {
  throw "Migrations directory not found: $MigrationsDir"
}

$targetDir = Split-Path -Parent $OutputFile
if (-not (Test-Path -LiteralPath $targetDir)) {
  New-Item -ItemType Directory -Path $targetDir | Out-Null
}

$files = Get-ChildItem -LiteralPath $MigrationsDir -Filter "*.sql" | Sort-Object Name
if ($files.Count -eq 0) {
  throw "No migration files found in: $MigrationsDir"
}

$header = @()
$header += "-- Auto-generated: concatenated Supabase migrations"
$header += "-- Source: $MigrationsDir"
$header += "-- Generated: $(Get-Date -Format s)"
$header += ""

$header | Set-Content -LiteralPath $OutputFile -Encoding UTF8

foreach ($file in $files) {
  Add-Content -LiteralPath $OutputFile -Value "\n-- =============================================="
  Add-Content -LiteralPath $OutputFile -Value "-- $($file.Name)"
  Add-Content -LiteralPath $OutputFile -Value "-- =============================================="
  Get-Content -LiteralPath $file.FullName | Add-Content -LiteralPath $OutputFile
}

Write-Host "Wrote: $OutputFile" -ForegroundColor Green
