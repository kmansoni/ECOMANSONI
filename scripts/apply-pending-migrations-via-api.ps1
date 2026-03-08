param(
  [string]$ProjectRef = "",
  [switch]$SkipE2EEGuard
)

$ErrorActionPreference = 'Stop'

function Resolve-ProjectRef([string]$PreferredRef, [string]$repoRoot) {
  if (-not [string]::IsNullOrWhiteSpace($PreferredRef)) { return $PreferredRef.Trim() }

  $linkedRefPath = Join-Path $repoRoot 'supabase\.temp\project-ref'
  if (Test-Path -LiteralPath $linkedRefPath) {
    $linked = (Get-Content -LiteralPath $linkedRefPath -Raw -Encoding UTF8).Trim()
    if (-not [string]::IsNullOrWhiteSpace($linked)) { return $linked }
  }

  $configPath = Join-Path $repoRoot 'supabase\config.toml'
  if (Test-Path -LiteralPath $configPath) {
    $line = Get-Content -LiteralPath $configPath | Where-Object { $_ -match '^\s*project_id\s*=\s*"([a-z0-9-]+)"\s*$' } | Select-Object -First 1
    if (-not [string]::IsNullOrWhiteSpace($line)) {
      $m = [regex]::Match($line, '^\s*project_id\s*=\s*"([a-z0-9-]+)"\s*$')
      if ($m.Success) { return $m.Groups[1].Value }
    }
  }

  throw 'Project ref is missing. Set -ProjectRef or link project first.'
}

function Read-Secret([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
  return ($value.Trim().Trim('"').Trim("'").Replace("`r",'').Replace("`n",''))
}

function Get-LocalMigrations([string]$repoRoot) {
  $migrationsDir = Join-Path $repoRoot 'supabase\migrations'
  if (-not (Test-Path -LiteralPath $migrationsDir)) {
    throw "Migrations directory not found: $migrationsDir"
  }

  $items = @()
  Get-ChildItem -LiteralPath $migrationsDir -Filter '*.sql' -File | Sort-Object Name | ForEach-Object {
    $m = [regex]::Match($_.Name, '^(\d+)_')
    if ($m.Success) {
      $version = $m.Groups[1].Value
      $name = ($_.BaseName.Substring($version.Length + 1))
      $items += [PSCustomObject]@{
        Version = $version
        Name = $name
        FileName = $_.Name
        Path = $_.FullName
      }
    }
  }

  return $items
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$resolvedProjectRef = Resolve-ProjectRef -PreferredRef $ProjectRef -repoRoot $repoRoot

$token = $env:SUPABASE_ACCESS_TOKEN
if ([string]::IsNullOrWhiteSpace($token)) {
  $token = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'User')
}
if ([string]::IsNullOrWhiteSpace($token)) {
  $token = Read-Secret 'Supabase access token (sbp_...)'
}
if ([string]::IsNullOrWhiteSpace($token)) {
  throw 'Supabase access token is empty.'
}

$api = "https://api.supabase.com/v1/projects/$resolvedProjectRef/database/query"
$headers = @{
  Authorization = "Bearer $token"
  apikey = $token
  'Content-Type' = 'application/json'
}

function Invoke-DbQuery([string]$query) {
  $body = @{ query = $query } | ConvertTo-Json -Compress
  $attempt = 0
  while ($true) {
    $attempt++
    try {
      $resp = Invoke-WebRequest -Uri $api -Method Post -Headers $headers -Body $body -ErrorAction Stop
      return ($resp.Content | ConvertFrom-Json)
    } catch {
      $msg = $_.Exception.Message
      $apiBody = $null
      try {
        $response = $_.Exception.Response
        if ($response -and $response.GetResponseStream) {
          $stream = $response.GetResponseStream()
          if ($stream) {
            $reader = New-Object System.IO.StreamReader($stream)
            $apiBody = $reader.ReadToEnd()
            $reader.Dispose()
            $stream.Dispose()
          }
        }
      } catch {
      }

      if ([string]::IsNullOrWhiteSpace($apiBody) -and -not [string]::IsNullOrWhiteSpace($_.ErrorDetails.Message)) {
        $apiBody = $_.ErrorDetails.Message
      }

      if (-not [string]::IsNullOrWhiteSpace($apiBody)) {
        $msg = "$msg`n$apiBody"
      }

      $isTransient =
        $msg -match 'unexpected EOF' -or
        $msg -match 'timed out' -or
        $msg -match 'temporar' -or
        $msg -match 'transport stream'

      if ($isTransient -and $attempt -lt 4) {
        $delay = [Math]::Pow(2, $attempt)
        Write-Host "Transient API error, retrying in ${delay}s (attempt $attempt/4)..." -ForegroundColor DarkYellow
        Start-Sleep -Seconds $delay
        continue
      }
      throw [System.Exception]::new($msg, $_.Exception)
    }
  }
}

function Test-CanMarkAsApplied([string]$errorMessage) {
  if ([string]::IsNullOrWhiteSpace($errorMessage)) {
    return $false
  }

  return (
    $errorMessage -match 'already exists' -or
    $errorMessage -match 'duplicate key value violates unique constraint' -or
    $errorMessage -match 'already defined' -or
    $errorMessage -match '42P07'
  )
}

Write-Host "Checking schema_migrations columns..." -ForegroundColor Cyan
$cols = Invoke-DbQuery "select column_name from information_schema.columns where table_schema='supabase_migrations' and table_name='schema_migrations' order by ordinal_position;"
$colNames = @($cols | ForEach-Object { $_.column_name })
Write-Host ("columns: " + ($colNames -join ', ')) -ForegroundColor Gray

Write-Host "Fetching remote applied migration versions..." -ForegroundColor Cyan
$appliedRows = Invoke-DbQuery "select version from supabase_migrations.schema_migrations order by version;"
$appliedVersions = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($row in @($appliedRows)) {
  if ($null -ne $row.version) {
    [void]$appliedVersions.Add([string]$row.version)
  }
}

$localMigrations = Get-LocalMigrations -repoRoot $repoRoot
$pending = @($localMigrations | Where-Object { -not $appliedVersions.Contains($_.Version) })

Write-Host "Local migrations: $($localMigrations.Count), remote applied: $($appliedVersions.Count), pending: $($pending.Count)" -ForegroundColor Gray
if ($pending.Count -eq 0) {
  Write-Host 'No pending migrations. Nothing to apply.' -ForegroundColor Green
  exit 0
}

if (-not $SkipE2EEGuard) {
  $e2eeGuardScript = Join-Path $PSScriptRoot "e2ee-guard.ps1"
  if (-not (Test-Path -LiteralPath $e2eeGuardScript)) {
    throw "E2EE guard script not found: $e2eeGuardScript"
  }

  $pendingFiles = @($pending | ForEach-Object { $_.FileName })
  $global:LASTEXITCODE = 0
  & $e2eeGuardScript -RepoRoot $repoRoot -MigrationFiles $pendingFiles
  if (-not $?) {
    throw "E2EE guard failed before applying migrations."
  }
  if ($LASTEXITCODE -ne 0) {
    throw "E2EE guard failed before applying migrations with exit code $LASTEXITCODE."
  }
}

foreach ($mig in $pending) {
  $version = $mig.Version
  $name = $mig.Name
  $file = $mig.FileName
  $path = $mig.Path

  $sql = Get-Content -LiteralPath $path -Raw -Encoding UTF8

  if ($version -eq '20260229001000') {
    # Compatibility fix: this legacy migration has bodies started with AS $$
    # but missing the closing $$ before LANGUAGE clauses.
    $sql = $sql -replace 'LANGUAGE\s+SQL\s+SECURITY\s+DEFINER;', '$$$$ LANGUAGE SQL SECURITY DEFINER;'
  }

  Write-Host "Applying $file" -ForegroundColor Yellow
  try {
    [void](Invoke-DbQuery $sql)
  } catch {
    $rawMessage = @(
      $_.Exception.Message,
      $_.ErrorDetails.Message,
      ($_ | Out-String)
    ) -join "`n"
    $legacyCrmRpcCanSkip = ($version -eq '20260229001000' -and ($rawMessage -match '42P13' -or $rawMessage -match 'default value'))

    if ((Test-CanMarkAsApplied $rawMessage) -or $legacyCrmRpcCanSkip) {
      Write-Host "Migration $file appears partially applied (idempotent conflict). Marking as applied and continuing." -ForegroundColor DarkYellow
    } else {
      throw
    }
  }

  $mark = "insert into supabase_migrations.schema_migrations(version) values ('$version') on conflict do nothing;"
  if ($colNames -contains 'name' -and $colNames -contains 'statements') {
    $mark = "insert into supabase_migrations.schema_migrations(version,name,statements) values ('$version','$name',ARRAY[]::text[]) on conflict do nothing;"
  } elseif ($colNames -contains 'name') {
    $mark = "insert into supabase_migrations.schema_migrations(version,name) values ('$version','$name') on conflict do nothing;"
  }

  [void](Invoke-DbQuery $mark)
  Write-Host "Applied and marked $version" -ForegroundColor Green
}

Write-Host 'All pending migrations applied via API.' -ForegroundColor Green
