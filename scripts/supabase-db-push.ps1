param(
  [switch]$DryRun,
  [switch]$Yes,
  [switch]$PromptDbPassword,
  [string]$DbPassword,
  [string]$SupabaseExePath = "C:\\Users\\manso\\AppData\\Local\\supabase-cli\\v2.75.0\\supabase.exe"
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $SupabaseExePath)) {
  throw "Supabase CLI not found at: $SupabaseExePath"
}

$previousToken = $env:SUPABASE_ACCESS_TOKEN
$tokenWasSet = [string]::IsNullOrWhiteSpace($previousToken) -eq $false

$dbPasswordWasSet = -not [string]::IsNullOrWhiteSpace($DbPassword)

try {
  if (-not $tokenWasSet) {
    $secure = Read-Host "Supabase access token (sbp_...)" -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
      $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }

    if ([string]::IsNullOrWhiteSpace($token)) {
      throw "Access token is empty."
    }

    $env:SUPABASE_ACCESS_TOKEN = $token
  }

  if (-not $dbPasswordWasSet -and $PromptDbPassword) {
    $securePw = Read-Host "Remote Postgres database password" -AsSecureString
    $bstrPw = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePw)
    try {
      $DbPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstrPw)
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstrPw)
    }

    if ([string]::IsNullOrWhiteSpace($DbPassword)) {
      throw "Database password is empty."
    }
  }

  $pushArgs = @('db', 'push')
  if ($DryRun) { $pushArgs += '--dry-run' }
  if ($Yes -or -not $PSBoundParameters.ContainsKey('Yes')) { $pushArgs += '--yes' }
  if (-not [string]::IsNullOrWhiteSpace($DbPassword)) {
    $pushArgs += @('-p', $DbPassword)
  }

  $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
  $logPath = Join-Path $repoRoot 'supabase\.temp\db-push.txt'

  Write-Host "Running: supabase $($pushArgs -join ' ')" -ForegroundColor Cyan
  $output = & $SupabaseExePath @pushArgs 2>&1
  $exitCode = $LASTEXITCODE

  $stamp = (Get-Date).ToString('s')
  $header = "[$stamp] supabase $($pushArgs -join ' ') (exit=$exitCode)"
  $toWrite = @($header) + ($output | ForEach-Object { "$($_)" })
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
  $DbPassword = $null
}
