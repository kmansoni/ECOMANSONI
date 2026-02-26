param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRef,
  [switch]$PromptToken,
  [string]$SupabaseExePath = "C:\\Users\\manso\\AppData\\Local\\supabase-cli\\v2.75.0\\supabase.exe"
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $SupabaseExePath)) {
  throw "Supabase CLI not found at: $SupabaseExePath"
}

if ([string]::IsNullOrWhiteSpace($ProjectRef)) {
  throw "ProjectRef is required."
}

$previousToken = $env:SUPABASE_ACCESS_TOKEN
$tokenWasSet = [string]::IsNullOrWhiteSpace($previousToken) -eq $false

try {
  if ($PromptToken -and -not $tokenWasSet) {
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
  } elseif (-not $tokenWasSet) {
    Write-Host "SUPABASE_ACCESS_TOKEN is not set; using Supabase CLI cached login if available." -ForegroundColor Yellow
  }

  $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
  $logPath = Join-Path $repoRoot 'supabase\\.temp\\link.txt'

  Write-Host "Running: supabase link --project-ref $ProjectRef" -ForegroundColor Cyan
  $output = & $SupabaseExePath link --project-ref $ProjectRef 2>&1
  $exitCode = $LASTEXITCODE

  $stamp = (Get-Date).ToString('s')
  $header = "[$stamp] supabase link --project-ref $ProjectRef (exit=$exitCode)"
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
}
