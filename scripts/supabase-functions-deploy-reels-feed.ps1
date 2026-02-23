param(
  [string]$SupabaseExePath = "",
  [string]$ProjectRef = "lfkbgnbjxskspsownvjm",
  [string]$FunctionName = "reels-feed"
)

$ErrorActionPreference = 'Stop'

function Resolve-SupabaseExe([string]$PreferredPath) {
  if (-not [string]::IsNullOrWhiteSpace($PreferredPath)) {
    if (-not (Test-Path -LiteralPath $PreferredPath)) {
      throw "Supabase CLI not found at: $PreferredPath"
    }
    return $PreferredPath
  }

  $pinned = Join-Path $env:LOCALAPPDATA "supabase-cli\v2.75.0\supabase.exe"
  if (Test-Path -LiteralPath $pinned) { return $pinned }
  return "supabase"
}

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

$previousToken = $env:SUPABASE_ACCESS_TOKEN
$tokenWasSet = -not [string]::IsNullOrWhiteSpace($previousToken)

try {
  $supabaseExe = Resolve-SupabaseExe $SupabaseExePath

  if (-not $tokenWasSet) {
    $env:SUPABASE_ACCESS_TOKEN = Read-SupabaseToken
  }

  if ([string]::IsNullOrWhiteSpace($ProjectRef)) {
    throw "ProjectRef is required."
  }

  Write-Host "Running: supabase link --project-ref $ProjectRef" -ForegroundColor Cyan
  & $supabaseExe link --project-ref $ProjectRef | Out-Host

  Write-Host "Running: supabase functions deploy $FunctionName" -ForegroundColor Cyan
  & $supabaseExe functions deploy $FunctionName | Out-Host

  Write-Host "Deploy complete: $FunctionName" -ForegroundColor Green
  exit 0
}
finally {
  if (-not $tokenWasSet) {
    Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
  } else {
    $env:SUPABASE_ACCESS_TOKEN = $previousToken
  }
}
