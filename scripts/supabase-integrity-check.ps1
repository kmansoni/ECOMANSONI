param(
  [Parameter(Mandatory = $true)]
  [string]$DbUrl,

  [string]$OutDir = "./.tmp/supabase-integrity",

  [string]$Tables = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($DbUrl)) {
  throw "DbUrl is required."
}

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  throw "psql is not available in PATH. Install PostgreSQL client tools."
}

if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
  throw "pg_dump is not available in PATH. Install PostgreSQL client tools."
}

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

$tablesList = @()
if (-not [string]::IsNullOrWhiteSpace($Tables)) {
  $tablesList = $Tables.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
} else {
  $query = "SELECT quote_ident(schemaname)||'.'||quote_ident(tablename) FROM pg_catalog.pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY 1;"
  $tablesRaw = psql $DbUrl -At -c $query
  $tablesList = $tablesRaw -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
}

$countsPath = Join-Path $OutDir "row-counts.csv"
"table,count" | Out-File $countsPath -Encoding ascii

foreach ($table in $tablesList) {
  $count = psql $DbUrl -At -c "SELECT COUNT(*) FROM $table;"
  "$table,$count" | Out-File $countsPath -Append -Encoding ascii

  $dumpPath = Join-Path $OutDir ("checksum-" + $table.Replace(".", "_") + ".sql")
  pg_dump $DbUrl --data-only --column-inserts --table=$table -f $dumpPath

  $hash = Get-FileHash -Algorithm SHA256 $dumpPath
  $hash.Hash | Out-File ($dumpPath + ".sha256") -Encoding ascii
}

Write-Host "Integrity artifacts created in $OutDir"
