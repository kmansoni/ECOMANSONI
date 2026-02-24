param(
  [switch]$DryRun,
  [switch]$Yes,
  [switch]$PromptDbPassword,
  [string]$SupabaseExePath = "C:\\Users\\manso\\AppData\\Local\\supabase-cli\\v2.75.0\\supabase.exe"
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $SupabaseExePath)) {
  throw "Supabase CLI not found at: $SupabaseExePath"
}

$previousToken = $env:SUPABASE_ACCESS_TOKEN
$tokenWasSet = [string]::IsNullOrWhiteSpace($previousToken) -eq $false

$DbPasswordSecure = $null
$dbPasswordWasSet = $false

try {
  if (-not $tokenWasSet) {
    Write-Host "WARN: SUPABASE_ACCESS_TOKEN is not set. Attempting to use Supabase CLI cached login." -ForegroundColor Yellow
    Write-Host "      If this fails, set SUPABASE_ACCESS_TOKEN in this session and retry." -ForegroundColor Yellow
  }

  $dbPasswordPlain = $null
  if (-not [string]::IsNullOrWhiteSpace($env:SUPABASE_DB_PASSWORD)) {
    $dbPasswordPlain = $env:SUPABASE_DB_PASSWORD
  } elseif (-not [string]::IsNullOrWhiteSpace($env:PGPASSWORD)) {
    $dbPasswordPlain = $env:PGPASSWORD
  }

  if ($PromptDbPassword -and [string]::IsNullOrWhiteSpace($dbPasswordPlain)) {
    $DbPasswordSecure = Read-Host "Remote Postgres database password" -AsSecureString
    if ($null -eq $DbPasswordSecure) {
      throw "Database password is empty."
    }
    $dbPasswordWasSet = $true
  }

  if ([string]::IsNullOrWhiteSpace($dbPasswordPlain) -and $null -ne $DbPasswordSecure) {
    $bstrPw = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($DbPasswordSecure)
    try {
      $dbPasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstrPw)
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstrPw)
    }
    if ([string]::IsNullOrWhiteSpace($dbPasswordPlain)) {
      throw "Database password is empty."
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
  if (-not [string]::IsNullOrWhiteSpace($dbPasswordPlain)) {
    $pushArgs += @('-p', $dbPasswordPlain)
    $pushArgsForLog += @('-p', '<redacted>')
  }

  $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
  $logPath = Join-Path $repoRoot 'supabase\.temp\db-push.txt'

  Write-Host "Running: supabase $($pushArgsForLog -join ' ')" -ForegroundColor Cyan
  $output = & $SupabaseExePath @pushArgs 2>&1
  $exitCode = $LASTEXITCODE

  $stamp = (Get-Date).ToString('s')
  $header = "[$stamp] supabase $($pushArgsForLog -join ' ') (exit=$exitCode)"

  function Sanitize-Line([string]$line) {
    if ($null -eq $line) { return $line }

    $s = [string]$line
    # Redact Supabase access tokens if they appear in any output.
    $s = [System.Text.RegularExpressions.Regex]::Replace($s, 'sbp_[A-Za-z0-9]+', 'sbp_<redacted>')
    # Redact any accidental "-p <password>" fragments that might slip into output.
    $s = [System.Text.RegularExpressions.Regex]::Replace($s, '(-p\s+)([^\s]+)', '$1<redacted>')
    return $s
  }

  $toWrite = @($header) + ($output | ForEach-Object { Sanitize-Line "$($_)" })
  $toWrite | Set-Content -LiteralPath $logPath -Encoding UTF8

  if ($exitCode -ne 0) {
    $output | ForEach-Object { Write-Host $_ }
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
}
