param(
  [switch]$DryRun,
  [switch]$Yes,
  [switch]$PromptDbPassword,
  [switch]$UseLinkedDbUrl,
  [switch]$UseApiApplyFallback,
  [string]$SupabaseExePath = "C:\\Users\\manso\\AppData\\Local\\supabase-cli\\v2.75.0\\supabase.exe"
)

$ErrorActionPreference = 'Stop'

function ConvertTo-NormalizedSecret([string]$value) {
  if ($null -eq $value) { return $null }
  $s = $value.Trim()
  if ($s.Length -ge 2) {
    if (($s.StartsWith('"') -and $s.EndsWith('"')) -or ($s.StartsWith("'") -and $s.EndsWith("'"))) {
      $s = $s.Substring(1, $s.Length - 2).Trim()
    }
  }
  # Keep secrets opaque: do not URL-decode %xx sequences.
  # Real passwords may legitimately contain these characters.
  # Remove hidden Unicode formatting chars that often appear after copy/paste
  # (zero-width spaces, BOM) and control chars from terminals/password managers.
  $s = [System.Text.RegularExpressions.Regex]::Replace($s, '[\u200B-\u200D\u2060\uFEFF]', '')
  $s = [System.Text.RegularExpressions.Regex]::Replace($s, '[\x00-\x1F\x7F]', '')
  return $s
}

function ConvertFrom-SecureStringToPlainText([Security.SecureString]$SecureValue) {
  if ($null -eq $SecureValue) {
    return $null
  }

  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Build-DbUrlWithPassword([string]$repoRoot, [Security.SecureString]$password) {
  if ([string]::IsNullOrWhiteSpace($repoRoot) -or $null -eq $password) {
    return $null
  }

  $poolerPath = Join-Path $repoRoot 'supabase\.temp\pooler-url'
  if (-not (Test-Path -LiteralPath $poolerPath)) {
    return $null
  }

  $baseUrl = (Get-Content -LiteralPath $poolerPath -Raw -Encoding UTF8).Trim()
  if ([string]::IsNullOrWhiteSpace($baseUrl)) {
    return $null
  }

  try {
    $uri = [System.Uri]$baseUrl
  } catch {
    return $null
  }

  $userInfo = $uri.UserInfo
  $username = $userInfo
  if ($userInfo -match ':') {
    $username = $userInfo.Split(':')[0]
  }
  if ([string]::IsNullOrWhiteSpace($username)) {
    return $null
  }

  $plainPassword = ConvertFrom-SecureStringToPlainText -SecureValue $password
  if ([string]::IsNullOrWhiteSpace($plainPassword)) {
    return $null
  }

  $builder = [System.UriBuilder]::new($uri)
  $builder.UserName = $username
  # UriBuilder will handle escaping for userinfo as needed.
  $builder.Password = $plainPassword

  # Ensure TLS for remote pooled connection.
  if ([string]::IsNullOrWhiteSpace($builder.Query)) {
    $builder.Query = 'sslmode=require'
  } elseif ($builder.Query -notmatch 'sslmode=') {
    $existing = $builder.Query.TrimStart('?')
    $builder.Query = "$existing&sslmode=require"
  }

  return $builder.Uri.AbsoluteUri
}

function Format-OutputLine([string]$line) {
  if ($null -eq $line) { return $line }

  $s = [string]$line
  # Redact Supabase access tokens if they appear in any output.
  $s = [System.Text.RegularExpressions.Regex]::Replace($s, 'sbp_[A-Za-z0-9]+', 'sbp_<redacted>')
  # Redact any accidental "-p <password>" fragments that might slip into output.
  $s = [System.Text.RegularExpressions.Regex]::Replace($s, '(-p\s+)([^\s]+)', '$1<redacted>')
  return $s
}

function Resolve-ProjectRefFromRepo([string]$repoRoot) {
  $linkedRefPath = Join-Path $repoRoot 'supabase\.temp\project-ref'
  if (Test-Path -LiteralPath $linkedRefPath) {
    $linked = (Get-Content -LiteralPath $linkedRefPath -Raw -Encoding UTF8).Trim()
    if (-not [string]::IsNullOrWhiteSpace($linked)) {
      return $linked
    }
  }

  $configPath = Join-Path $repoRoot 'supabase\config.toml'
  if (Test-Path -LiteralPath $configPath) {
    $line = Get-Content -LiteralPath $configPath | Where-Object { $_ -match '^\s*project_id\s*=\s*"([a-z0-9-]+)"\s*$' } | Select-Object -First 1
    if (-not [string]::IsNullOrWhiteSpace($line)) {
      $m = [regex]::Match($line, '^\s*project_id\s*=\s*"([a-z0-9-]+)"\s*$')
      if ($m.Success) { return $m.Groups[1].Value }
    }
  }

  return ""
}

function Get-PendingMigrationsViaApi([string]$repoRoot, [string]$token) {
  if ([string]::IsNullOrWhiteSpace($token)) {
    return @{ ok = $false; lines = @('API fallback: SUPABASE_ACCESS_TOKEN is missing.') }
  }

  $projectRef = Resolve-ProjectRefFromRepo -repoRoot $repoRoot
  if ([string]::IsNullOrWhiteSpace($projectRef)) {
    return @{ ok = $false; lines = @('API fallback: project ref is missing.') }
  }

  $api = "https://api.supabase.com/v1/projects/$projectRef/database/query"
  $headers = @{
    Authorization = "Bearer $token"
    apikey = $token
    'Content-Type' = 'application/json'
  }

  try {
    $body = @{ query = "select version from supabase_migrations.schema_migrations order by version;" } | ConvertTo-Json -Compress
    $attempt = 0
    while ($true) {
      $attempt++
      try {
        $resp = Invoke-WebRequest -Uri $api -Method Post -Headers $headers -Body $body -ErrorAction Stop
        $rows = $resp.Content | ConvertFrom-Json
        break
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
          $msg -match 'transport stream' -or
          $msg -match 'SSL connection could not be established'

        if ($isTransient -and $attempt -lt 4) {
          $delay = [Math]::Pow(2, $attempt)
          Write-Host "Transient API error, retrying in ${delay}s (attempt $attempt/4)..." -ForegroundColor DarkYellow
          Start-Sleep -Seconds $delay
          continue
        }

        throw [System.Exception]::new($msg, $_.Exception)
      }
    }

    $applied = New-Object 'System.Collections.Generic.HashSet[string]'
    foreach ($row in @($rows)) {
      if ($null -ne $row.version) {
        [void]$applied.Add([string]$row.version)
      }
    }

    $migrationsDir = Join-Path $repoRoot 'supabase\migrations'
    if (-not (Test-Path -LiteralPath $migrationsDir)) {
      return @{ ok = $false; lines = @('API fallback: migrations directory not found.') }
    }

    $localVersions = @()
    Get-ChildItem -LiteralPath $migrationsDir -Filter '*.sql' -File | Sort-Object Name | ForEach-Object {
      $m = [regex]::Match($_.Name, '^(\d+)_')
      if ($m.Success) {
        $localVersions += $m.Groups[1].Value
      }
    }

    $pending = @($localVersions | Where-Object { -not $applied.Contains($_) })
    $lines = @()
    $lines += 'API fallback dry-run summary:'
    $lines += "  project_ref: $projectRef"
    $lines += "  local_migrations: $($localVersions.Count)"
    $lines += "  applied_remote: $($applied.Count)"
    $lines += "  pending: $($pending.Count)"
    if ($pending.Count -gt 0) {
      $lines += '  pending_versions:'
      foreach ($v in $pending) { $lines += "    - $v" }
    }

    return @{ ok = $true; lines = $lines }
  } catch {
    return @{ ok = $false; lines = @("API fallback failed: $($_.Exception.Message)") }
  }
}

function Invoke-ApiApplyFallback([string]$repoRoot) {
  $scriptPath = Join-Path $repoRoot 'scripts\apply-pending-migrations-via-api.ps1'
  if (-not (Test-Path -LiteralPath $scriptPath)) {
    return @{ ok = $false; lines = @("API apply fallback script not found: $scriptPath") }
  }

  try {
    $result = & pwsh -NoProfile -ExecutionPolicy Bypass -File $scriptPath 2>&1
    $code = $LASTEXITCODE
    return @{ ok = ($code -eq 0); lines = @($result) }
  } catch {
    return @{ ok = $false; lines = @("API apply fallback failed: $($_.Exception.Message)") }
  }
}

if (-not (Test-Path -LiteralPath $SupabaseExePath)) {
  throw "Supabase CLI not found at: $SupabaseExePath"
}

$useLinkedDbUrlEnabled = $true
if ($PSBoundParameters.ContainsKey('UseLinkedDbUrl')) {
  $useLinkedDbUrlEnabled = [bool]$UseLinkedDbUrl
}

$useApiApplyFallbackEnabled = $true
if ($PSBoundParameters.ContainsKey('UseApiApplyFallback')) {
  $useApiApplyFallbackEnabled = [bool]$UseApiApplyFallback
}

$previousToken = $env:SUPABASE_ACCESS_TOKEN
$tokenWasSet = [string]::IsNullOrWhiteSpace($previousToken) -eq $false
$previousPgPassword = $env:PGPASSWORD
$previousSupabaseDbPassword = $env:SUPABASE_DB_PASSWORD

# Resolve token from user/machine env if not present in current session.
if (-not $tokenWasSet) {
  $userToken = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'User')
  $machineToken = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'Machine')
  if (-not [string]::IsNullOrWhiteSpace($userToken)) {
    $env:SUPABASE_ACCESS_TOKEN = $userToken
    $tokenWasSet = $true
  } elseif (-not [string]::IsNullOrWhiteSpace($machineToken)) {
    $env:SUPABASE_ACCESS_TOKEN = $machineToken
    $tokenWasSet = $true
  }
}

$DbPasswordSecure = $null

try {
  if (-not $tokenWasSet) {
    Write-Host "WARN: SUPABASE_ACCESS_TOKEN is not set. Attempting to use Supabase CLI cached login." -ForegroundColor Yellow
    Write-Host "      If this fails, set SUPABASE_ACCESS_TOKEN in this session and retry." -ForegroundColor Yellow
  }

  $dbPasswordPlain = $null
  if (-not [string]::IsNullOrWhiteSpace($env:SUPABASE_DB_PASSWORD)) {
    $dbPasswordPlain = ConvertTo-NormalizedSecret $env:SUPABASE_DB_PASSWORD
  } elseif (-not [string]::IsNullOrWhiteSpace($env:PGPASSWORD)) {
    $dbPasswordPlain = ConvertTo-NormalizedSecret $env:PGPASSWORD
  } else {
    $userDbPassword = [Environment]::GetEnvironmentVariable('SUPABASE_DB_PASSWORD', 'User')
    $machineDbPassword = [Environment]::GetEnvironmentVariable('SUPABASE_DB_PASSWORD', 'Machine')
    $userPgPassword = [Environment]::GetEnvironmentVariable('PGPASSWORD', 'User')
    $machinePgPassword = [Environment]::GetEnvironmentVariable('PGPASSWORD', 'Machine')

    if (-not [string]::IsNullOrWhiteSpace($userDbPassword)) {
      $dbPasswordPlain = ConvertTo-NormalizedSecret $userDbPassword
    } elseif (-not [string]::IsNullOrWhiteSpace($machineDbPassword)) {
      $dbPasswordPlain = ConvertTo-NormalizedSecret $machineDbPassword
    } elseif (-not [string]::IsNullOrWhiteSpace($userPgPassword)) {
      $dbPasswordPlain = ConvertTo-NormalizedSecret $userPgPassword
    } elseif (-not [string]::IsNullOrWhiteSpace($machinePgPassword)) {
      $dbPasswordPlain = ConvertTo-NormalizedSecret $machinePgPassword
    }
  }

  if ($PromptDbPassword) {
    # Force manual password input to avoid stale env secrets.
    $dbPasswordPlain = $null
    $DbPasswordSecure = Read-Host "Remote Postgres database password" -AsSecureString
    if ($null -eq $DbPasswordSecure) {
      throw "Database password is empty."
    }
  }

  if ([string]::IsNullOrWhiteSpace($dbPasswordPlain) -and $null -ne $DbPasswordSecure) {
    $dbPasswordPlain = ConvertFrom-SecureStringToPlainText -SecureValue $DbPasswordSecure
    if (-not $PromptDbPassword) {
      $dbPasswordPlain = ConvertTo-NormalizedSecret $dbPasswordPlain
    }
    if ([string]::IsNullOrWhiteSpace($dbPasswordPlain)) {
      throw "Database password is empty."
    }
  }

  if (-not [string]::IsNullOrWhiteSpace($dbPasswordPlain)) {
    if ($dbPasswordPlain.StartsWith('sbp_')) {
      throw "Database password looks like a Supabase Access Token (sbp_...). Use the project's DATABASE password from Supabase Dashboard > Project Settings > Database."
    }
    if ($dbPasswordPlain.StartsWith('eyJ')) {
      throw "Database password looks like a JWT token. Use the project's DATABASE password from Supabase Dashboard > Project Settings > Database."
    }
  }

  $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

  if ($null -eq $DbPasswordSecure -and -not [string]::IsNullOrWhiteSpace($dbPasswordPlain)) {
    $DbPasswordSecure = ConvertTo-SecureString -String $dbPasswordPlain -AsPlainText -Force
  }

  if ([string]::IsNullOrWhiteSpace($dbPasswordPlain) -and $useApiApplyFallbackEnabled) {
    if ($DryRun) {
      Write-Host "No DB password provided; using Management API dry-run fallback." -ForegroundColor Yellow
      $apiFallbackNoPw = Get-PendingMigrationsViaApi -repoRoot $repoRoot -token $env:SUPABASE_ACCESS_TOKEN
      $fallbackLines = @('[fallback] management-api pending-migrations') + @($apiFallbackNoPw.lines)
      $exitCode = if ($apiFallbackNoPw.ok) { 0 } else { 1 }
      $stamp = (Get-Date).ToString('s')
      $header = "[$stamp] supabase db push --dry-run --yes (api-fallback-no-password) (exit=$exitCode)"
      @($header) + $fallbackLines | Set-Content -LiteralPath (Join-Path $repoRoot 'supabase\.temp\db-push.txt') -Encoding UTF8
      if ($apiFallbackNoPw.ok) {
        Write-Host "Dry-run fallback succeeded via Management API." -ForegroundColor Green
      } else {
        Write-Host "Dry-run fallback failed." -ForegroundColor Red
      }
      exit $exitCode
    } else {
      Write-Host "No DB password provided; using Management API apply fallback." -ForegroundColor Yellow
      $applyNoPw = Invoke-ApiApplyFallback -repoRoot $repoRoot
      $fallbackLines = @('[fallback] management-api apply') + @($applyNoPw.lines)
      $exitCode = if ($applyNoPw.ok) { 0 } else { 1 }
      $stamp = (Get-Date).ToString('s')
      $header = "[$stamp] supabase db push --yes (api-fallback-no-password) (exit=$exitCode)"
      @($header) + $fallbackLines | Set-Content -LiteralPath (Join-Path $repoRoot 'supabase\.temp\db-push.txt') -Encoding UTF8
      if ($applyNoPw.ok) {
        Write-Host "Push fallback succeeded via Management API apply." -ForegroundColor Green
      } else {
        Write-Host "Push fallback failed." -ForegroundColor Red
      }
      exit $exitCode
    }
  }

  $pushArgs = @('db', 'push')
  $pushArgsForLog = @('db', 'push')
  if ($DryRun) {
    $pushArgs += '--dry-run'
    $pushArgsForLog += '--dry-run'
  }
  if ($Yes -or -not $PSBoundParameters.ContainsKey('Yes')) {
    $pushArgs += '--yes'
    $pushArgsForLog += '--yes'
  }

  $dbUrl = $null
  if ($useLinkedDbUrlEnabled -and $null -ne $DbPasswordSecure) {
    $dbUrl = Build-DbUrlWithPassword -repoRoot $repoRoot -password $DbPasswordSecure
  }

  if (-not [string]::IsNullOrWhiteSpace($dbUrl)) {
    $pushArgs += @('--db-url', $dbUrl)
    $pushArgsForLog += @('--db-url', '<linked:redacted>')
  }

  if (-not [string]::IsNullOrWhiteSpace($dbPasswordPlain)) {
    $env:PGPASSWORD = $dbPasswordPlain
    $env:SUPABASE_DB_PASSWORD = $dbPasswordPlain
    if ([string]::IsNullOrWhiteSpace($dbUrl) -and -not $PromptDbPassword) {
      $pushArgs += @('--password', $dbPasswordPlain)
      $pushArgsForLog += @('-p', '<env:redacted>')
    }
  }

  $logPath = Join-Path $repoRoot 'supabase\.temp\db-push.txt'

  Write-Host "Running: supabase $($pushArgsForLog -join ' ')" -ForegroundColor Cyan
  $output = & $SupabaseExePath @pushArgs 2>&1
  $exitCode = $LASTEXITCODE

  $joined = ($output | ForEach-Object { [string]$_ }) -join "`n"
  if ($exitCode -ne 0 -and $DryRun -and $joined -match 'SQLSTATE 28P01|password authentication failed') {
    Write-Host "DB dry-run auth failed; falling back to Management API migration check." -ForegroundColor Yellow
    $apiFallback = Get-PendingMigrationsViaApi -repoRoot $repoRoot -token $env:SUPABASE_ACCESS_TOKEN
    $output = @($output) + @('') + @('[fallback] management-api pending-migrations') + @($apiFallback.lines)
    if ($apiFallback.ok) {
      Write-Host "Dry-run fallback succeeded via Management API." -ForegroundColor Green
      $exitCode = 0
      $joined = ($output | ForEach-Object { [string]$_ }) -join "`n"
    } else {
      Write-Host "Dry-run fallback also failed." -ForegroundColor Red
    }
  }

  if ($exitCode -ne 0 -and -not $DryRun -and $useApiApplyFallbackEnabled -and $joined -match 'SQLSTATE 28P01|password authentication failed') {
    Write-Host "DB push auth failed; falling back to Management API apply." -ForegroundColor Yellow
    $applyFallback = Invoke-ApiApplyFallback -repoRoot $repoRoot
    $output = @($output) + @('') + @('[fallback] management-api apply') + @($applyFallback.lines)
    if ($applyFallback.ok) {
      Write-Host "Push fallback succeeded via Management API apply." -ForegroundColor Green
      $exitCode = 0
      $joined = ($output | ForEach-Object { [string]$_ }) -join "`n"
    } else {
      Write-Host "Push fallback also failed." -ForegroundColor Red
    }
  }

  $stamp = (Get-Date).ToString('s')
  $header = "[$stamp] supabase $($pushArgsForLog -join ' ') (exit=$exitCode)"

  $toWrite = @($header) + ($output | ForEach-Object { Format-OutputLine "$($_)" })
  $toWrite | Set-Content -LiteralPath $logPath -Encoding UTF8

  if ($exitCode -ne 0) {
    $output | ForEach-Object { Write-Host $_ }

    if ($joined -match 'SQLSTATE 28P01|password authentication failed') {
      Write-Host "" -ForegroundColor Yellow
      Write-Host "DB authentication failed (SQLSTATE 28P01)." -ForegroundColor Yellow
      Write-Host "Use the project Database password (not sbp_ token / JWT)." -ForegroundColor Yellow
      Write-Host "If unsure, reset it here: https://supabase.com/dashboard/project/lfkbgnbjxskspsownvjm/settings/database" -ForegroundColor Yellow
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

  # Best-effort: clear password variable
  $DbPasswordSecure = $null
  $dbPasswordPlain = $null
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
