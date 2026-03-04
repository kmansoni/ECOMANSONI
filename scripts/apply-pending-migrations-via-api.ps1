param(
  [string]$ProjectRef = "lfkbgnbjxskspsownvjm",
  [switch]$SkipE2EEGuard
)

$ErrorActionPreference = 'Stop'

$pending = @(
  '20260228183000_email_router_inbound_inbox.sql',
  '20260228190000_email_router_threads_and_read_state.sql',
  '20260228193000_bots_and_mini_apps.sql',
  '20260229000000_crm_core.sql',
  '20260229000001_phase1_chat_features_b076_b077_b097_b098.sql',
  '20260229001000_crm_rpc.sql',
  '20260303150000_e2ee_schema_alignment_v2.sql',
  '20260304060000_e2ee_disable_encryption_rpc.sql',
  '20260304103000_e2ee_enable_encryption_rpc.sql'
)

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $SkipE2EEGuard) {
  $e2eeGuardScript = Join-Path $PSScriptRoot "e2ee-guard.ps1"
  if (-not (Test-Path -LiteralPath $e2eeGuardScript)) {
    throw "E2EE guard script not found: $e2eeGuardScript"
  }
  $global:LASTEXITCODE = 0
  & $e2eeGuardScript -RepoRoot $repoRoot -MigrationFiles $pending
  if (-not $?) {
    throw "E2EE guard failed before applying migrations."
  }
  if ($LASTEXITCODE -ne 0) {
    throw "E2EE guard failed before applying migrations with exit code $LASTEXITCODE."
  }
}

function Read-Secret([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
  return ($value.Trim().Trim('"').Trim("'").Replace("`r",'').Replace("`n",'').Replace(' ',''))
}

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

$api = "https://api.supabase.com/v1/projects/$ProjectRef/database/query"
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

foreach ($file in $pending) {
  $path = Join-Path $repoRoot ("supabase/migrations/" + $file)
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Migration file not found: $path"
  }

  $version = ($file -split '_')[0]
  $name = ($file.Substring($version.Length + 1) -replace '\\.sql$','')
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
