param(
  [Parameter(Mandatory=$true)]
  [string]$TurnDomain,

  [Parameter(Mandatory=$true)]
  [string]$TurnSharedSecret,

  [int]$TurnTtlSeconds = 3600
)

$ErrorActionPreference = "Stop"

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  throw "SUPABASE_ACCESS_TOKEN is not set in this PowerShell session"
}

$sb = Join-Path $env:LOCALAPPDATA "supabase-cli\v2.75.0\supabase.exe"
if (-not (Test-Path $sb)) {
  throw "Supabase CLI not found at $sb"
}

$turnUrls = @(
  "turn:$TurnDomain:3478?transport=udp",
  "turn:$TurnDomain:3478?transport=tcp",
  "turns:$TurnDomain:5349?transport=tcp"
) -join ","

Write-Host "Setting Supabase TURN secrets..." -ForegroundColor Cyan
Write-Host "TURN_URLS=$turnUrls" -ForegroundColor DarkGray

& $sb secrets set `
  TURN_URLS="$turnUrls" `
  TURN_SHARED_SECRET="$TurnSharedSecret" `
  TURN_TTL_SECONDS="$TurnTtlSeconds"

Write-Host "Done." -ForegroundColor Green
