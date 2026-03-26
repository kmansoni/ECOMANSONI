param(
  [switch]$PromptToken,
  [switch]$PromptDbPassword,
  [int]$RetryCount = 3,
  [int]$RetryDelaySeconds = 3,
  [switch]$SkipApiFallback,
  [string]$SupabaseExePath = "C:\\Users\\manso\\AppData\\Local\\supabase-cli\\v2.75.0\\supabase.exe"
)

$ErrorActionPreference = 'Stop'

if ($RetryCount -lt 1) { $RetryCount = 1 }
if ($RetryDelaySeconds -lt 1) { $RetryDelaySeconds = 1 }

if (-not (Test-Path -LiteralPath $SupabaseExePath)) {
  throw "Supabase CLI not found at: $SupabaseExePath"
}

$previousToken = $env:SUPABASE_ACCESS_TOKEN
$tokenWasSet = [string]::IsNullOrWhiteSpace($previousToken) -eq $false
$previousPgPassword = $env:PGPASSWORD
$previousSupabaseDbPassword = $env:SUPABASE_DB_PASSWORD

function Read-SecretString([string]$prompt) {
  $secure = Read-Host $prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Resolve-ProjectRef([string]$repoRootPath) {
  $linkedRefPath = Join-Path $repoRootPath 'supabase\.temp\project-ref'
  if (Test-Path -LiteralPath $linkedRefPath) {
    $linked = (Get-Content -LiteralPath $linkedRefPath -Raw -Encoding UTF8).Trim()
    if (-not [string]::IsNullOrWhiteSpace($linked)) {
      return $linked
    }
  }

  $configPath = Join-Path $repoRootPath 'supabase\config.toml'
  if (Test-Path -LiteralPath $configPath) {
    $line = Get-Content -LiteralPath $configPath | Where-Object { $_ -match '^\s*project_id\s*=\s*"([a-z0-9-]+)"\s*$' } | Select-Object -First 1
    if (-not [string]::IsNullOrWhiteSpace($line)) {
      $m = [regex]::Match($line, '^\s*project_id\s*=\s*"([a-z0-9-]+)"\s*$')
      if ($m.Success) {
        return $m.Groups[1].Value
      }
    }
  }

  return ""
}

function Invoke-ManagementApiQuery(
  [string]$projectRef,
  [string]$token,
  [string]$query,
  [int]$apiRetryCount,
  [int]$apiRetryDelaySeconds
) {
  $api = "https://api.supabase.com/v1/projects/$projectRef/database/query"
  $headers = @{
    Authorization = "Bearer $token"
    apikey = $token
    'Content-Type' = 'application/json'
  }
  $body = @{ query = $query } | ConvertTo-Json -Compress

  $attempt = 0
  while ($attempt -lt $apiRetryCount) {
    $attempt++
    try {
      $resp = Invoke-WebRequest -Uri $api -Method Post -Headers $headers -Body $body -ErrorAction Stop
      return ($resp.Content | ConvertFrom-Json)
    } catch {
      $message = $_.Exception.Message
      $isTransient = $message -match 'timed out|connection attempt failed|wsarecv|i/o timeout|unexpected EOF|temporar'
      if (-not $isTransient -or $attempt -ge $apiRetryCount) {
        throw
      }
      Start-Sleep -Seconds $apiRetryDelaySeconds
    }
  }

  throw "Management API query failed after retries."
}

function Try-ApiMigrationList(
  [string]$repoRootPath,
  [int]$apiRetryCount,
  [int]$apiRetryDelaySeconds
) {
  $projectRef = Resolve-ProjectRef -repoRootPath $repoRootPath
  if ([string]::IsNullOrWhiteSpace($projectRef)) {
    return @{ ok = $false; reason = 'Project ref is missing.' }
  }

  $token = $env:SUPABASE_ACCESS_TOKEN
  if ([string]::IsNullOrWhiteSpace($token)) {
    $token = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'User')
  }
  if ([string]::IsNullOrWhiteSpace($token)) {
    $token = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'Machine')
  }
  if ([string]::IsNullOrWhiteSpace($token)) {
    return @{ ok = $false; reason = 'SUPABASE_ACCESS_TOKEN is missing for API fallback. Use -PromptToken or set env var.' }
  }

  try {
    $rows = Invoke-ManagementApiQuery -projectRef $projectRef -token $token -query 'select version from supabase_migrations.schema_migrations order by version;' -apiRetryCount $apiRetryCount -apiRetryDelaySeconds $apiRetryDelaySeconds
    return @{ ok = $true; projectRef = $projectRef; rows = @($rows) }
  } catch {
    return @{ ok = $false; reason = $_.Exception.Message }
  }
}

try {
  if ($PromptToken -and -not $tokenWasSet) {
    $token = Read-SecretString "Supabase access token (sbp_...)"

    if ([string]::IsNullOrWhiteSpace($token)) {
      throw "Access token is empty."
    }

    $env:SUPABASE_ACCESS_TOKEN = $token
  } elseif (-not $tokenWasSet) {
    Write-Host "SUPABASE_ACCESS_TOKEN is not set; using Supabase CLI cached login if available." -ForegroundColor Yellow
  }

  $dbPasswordWasSet = [string]::IsNullOrWhiteSpace($env:SUPABASE_DB_PASSWORD) -eq $false
  if ($PromptDbPassword -and -not $dbPasswordWasSet) {
    $dbPassword = Read-SecretString "Supabase DB password"
    if ([string]::IsNullOrWhiteSpace($dbPassword)) {
      throw "DB password is empty."
    }
    # Supabase CLI suggests SUPABASE_DB_PASSWORD for direct DB auth fallback.
    $env:SUPABASE_DB_PASSWORD = $dbPassword
    $env:PGPASSWORD = $dbPassword
  }

  $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
  $logPath = Join-Path $repoRoot 'supabase\.temp\migration-list.txt'

  Write-Host "Running: supabase migration list" -ForegroundColor Cyan
  $output = @()
  $exitCode = 1
  $attempt = 0
  while ($attempt -lt $RetryCount) {
    $attempt++
    if ($attempt -gt 1) {
      Write-Host "Retry $attempt/$RetryCount..." -ForegroundColor Yellow
    }

    $output = & $SupabaseExePath migration list 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -eq 0) {
      break
    }

    $joined = ($output | ForEach-Object { [string]$_ }) -join "`n"
    $isTransient = $joined -match 'i/o timeout|connection attempt failed|wsarecv|failed SASL auth|timed out'
    if (-not $isTransient -or $attempt -ge $RetryCount) {
      break
    }

    Start-Sleep -Seconds $RetryDelaySeconds
  }

  $stamp = (Get-Date).ToString('s')
  $header = "[$stamp] supabase migration list (exit=$exitCode)"
  $toWrite = @($header) + ($output | ForEach-Object { "$($_)" })
  $toWrite | Set-Content -LiteralPath $logPath -Encoding UTF8

  if ($exitCode -ne 0) {
    $output | ForEach-Object { Write-Host $_ }

    if (-not $SkipApiFallback) {
      Write-Host "CLI migration list failed; trying Management API fallback..." -ForegroundColor Yellow
      $apiState = Try-ApiMigrationList -repoRootPath $repoRoot -apiRetryCount $RetryCount -apiRetryDelaySeconds $RetryDelaySeconds
      if ($apiState.ok) {
        $remoteVersions = @($apiState.rows | ForEach-Object { [string]$_.version })
        Write-Host "Remote migrations via API for project $($apiState.projectRef):" -ForegroundColor Cyan
        foreach ($v in $remoteVersions) {
          Write-Host " - $v"
        }

        $apiHeader = "[$stamp] API fallback success: project=$($apiState.projectRef), versions=$($remoteVersions.Count)"
        $apiLog = @($apiHeader) + ($remoteVersions | ForEach-Object { "remote:$($_)" })
        $apiLog | Add-Content -LiteralPath $logPath -Encoding UTF8
        exit 0
      }

      Write-Host "API fallback failed: $($apiState.reason)" -ForegroundColor Red
      Write-Host "Tip: run with -PromptToken to provide access token interactively." -ForegroundColor Yellow
    }
  }

  exit $exitCode
}
finally {
  if (-not $tokenWasSet) {
    Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
  } else {
    $env:SUPABASE_ACCESS_TOKEN = $previousToken
  }

  if ($null -eq $previousPgPassword) {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  } else {
    $env:PGPASSWORD = $previousPgPassword
  }

  if ($null -eq $previousSupabaseDbPassword) {
    Remove-Item Env:SUPABASE_DB_PASSWORD -ErrorAction SilentlyContinue
  } else {
    $env:SUPABASE_DB_PASSWORD = $previousSupabaseDbPassword
  }
}
