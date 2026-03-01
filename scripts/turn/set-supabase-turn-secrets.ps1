param(
  [Parameter(Mandatory=$true)]
  [string]$TurnDomain,

  [string]$TurnSharedSecret,

  [int]$TurnTtlSeconds = 3600,

  [switch]$IncludeTurns,

  [switch]$PromptSharedSecret,

  [switch]$PromptAccessToken
)

$ErrorActionPreference = "Stop"

function ConvertTo-PlainText {
  param([Parameter(Mandatory=$true)][Security.SecureString]$Secure)
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Resolve-SupabaseExe {
  if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
    $pinned = Join-Path $env:LOCALAPPDATA "supabase-cli\v2.75.0\supabase.exe"
    if (Test-Path $pinned) { return $pinned }
  }

  $supabaseCmd = Get-Command supabase -ErrorAction SilentlyContinue
  if ($null -ne $supabaseCmd -and -not [string]::IsNullOrWhiteSpace($supabaseCmd.Source)) {
    return $supabaseCmd.Source
  }

  return "supabase"
}

if ($PromptAccessToken -and [string]::IsNullOrWhiteSpace($env:SUPABASE_ACCESS_TOKEN)) {
  $secureToken = Read-Host "Supabase access token (sbp_...)" -AsSecureString
  $plainToken = ConvertTo-PlainText -Secure $secureToken
  if ([string]::IsNullOrWhiteSpace($plainToken)) {
    throw "Supabase access token is empty."
  }
  $env:SUPABASE_ACCESS_TOKEN = $plainToken
}

if ($PromptSharedSecret -and [string]::IsNullOrWhiteSpace($TurnSharedSecret)) {
  $secureTurnSecret = Read-Host "TURN shared secret" -AsSecureString
  $TurnSharedSecret = ConvertTo-PlainText -Secure $secureTurnSecret
}

if ([string]::IsNullOrWhiteSpace($TurnSharedSecret)) {
  if (-not [string]::IsNullOrWhiteSpace($env:TURN_SHARED_SECRET)) {
    $TurnSharedSecret = $env:TURN_SHARED_SECRET
  } else {
    throw "TURN shared secret is required. Pass -TurnSharedSecret, set TURN_SHARED_SECRET, or use -PromptSharedSecret."
  }
}

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  Write-Host "SUPABASE_ACCESS_TOKEN is not set; using Supabase CLI cached login if available." -ForegroundColor Yellow
  $script:MissingAccessToken = $true
}

$sb = Resolve-SupabaseExe

$urls = @(
  "turn:$TurnDomain:3478?transport=udp",
  "turn:$TurnDomain:3478?transport=tcp"
)

if ($IncludeTurns) {
  $urls += "turns:$TurnDomain:5349?transport=tcp"
}

$turnUrls = $urls -join ","

Write-Host "Setting Supabase TURN secrets..." -ForegroundColor Cyan
Write-Host "TURN_URLS=$turnUrls" -ForegroundColor DarkGray

if ($script:MissingAccessToken) {
  Write-Host "WARNING: SUPABASE_ACCESS_TOKEN was not set at script start." -ForegroundColor Yellow
  Write-Host "If the CLI does not have a cached session, the following command will fail with a generic authorization error." -ForegroundColor Yellow
  Write-Host "To avoid this, set $env:SUPABASE_ACCESS_TOKEN before running this script." -ForegroundColor Yellow
}

& $sb secrets set `
  TURN_URLS="$turnUrls" `
  TURN_SHARED_SECRET="$TurnSharedSecret" `
  TURN_TTL_SECONDS="$TurnTtlSeconds"

Write-Host "Done." -ForegroundColor Green
