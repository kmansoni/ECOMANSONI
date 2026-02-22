param(
  [string]$SupabaseExePath = "C:\\Users\\manso\\AppData\\Local\\supabase-cli\\v2.75.0\\supabase.exe",
  [string]$ProjectRef = "lfkbgnbjxskspsownvjm",
  [string[]]$Functions = @(
    "ai-companion",
    "ensure-ai-assistant",
    "ai-chat-reply",
    "ai-send-message",
    "ai-dispatch-pr"
  )
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $SupabaseExePath)) {
  throw "Supabase CLI not found at: $SupabaseExePath"
}

$previousToken = $env:SUPABASE_ACCESS_TOKEN
$tokenWasSet = [string]::IsNullOrWhiteSpace($previousToken) -eq $false

function Read-SupabaseToken {
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

  return $token
}

try {
  if (-not $tokenWasSet) {
    $env:SUPABASE_ACCESS_TOKEN = Read-SupabaseToken
  }

  $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
  $tempDir = Join-Path $repoRoot 'supabase\.temp'
  New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
  $logPath = Join-Path $tempDir 'functions-deploy-ai-stack.txt'

  $stamp = (Get-Date).ToString('s')
  "[$stamp] Starting AI stack deploy" | Set-Content -LiteralPath $logPath -Encoding UTF8

  Write-Host "Running: supabase link --project-ref $ProjectRef" -ForegroundColor Cyan
  $linkOut = & $SupabaseExePath link --project-ref $ProjectRef 2>&1
  $linkExit = $LASTEXITCODE
  "[link exit=$linkExit]" | Add-Content -LiteralPath $logPath -Encoding UTF8
  $linkOut | ForEach-Object { "$_" } | Add-Content -LiteralPath $logPath -Encoding UTF8
  if ($linkExit -ne 0) {
    $linkOut | ForEach-Object { Write-Host $_ }
    exit $linkExit
  }

  foreach ($fn in $Functions) {
    Write-Host "Running: supabase functions deploy $fn" -ForegroundColor Cyan
    $out = & $SupabaseExePath functions deploy $fn 2>&1
    $exitCode = $LASTEXITCODE

    $stampFn = (Get-Date).ToString('s')
    "[$stampFn] deploy $fn (exit=$exitCode)" | Add-Content -LiteralPath $logPath -Encoding UTF8
    $out | ForEach-Object { "$_" } | Add-Content -LiteralPath $logPath -Encoding UTF8

    if ($exitCode -ne 0) {
      $out | ForEach-Object { Write-Host $_ }
      exit $exitCode
    }
  }

  Write-Host "AI stack deploy complete." -ForegroundColor Green
  exit 0
}
finally {
  if (-not $tokenWasSet) {
    Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
  } else {
    $env:SUPABASE_ACCESS_TOKEN = $previousToken
  }
}
