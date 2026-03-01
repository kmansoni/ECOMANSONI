param(
  [string]$ProjectRef = "lfkbgnbjxskspsownvjm",
  [switch]$PromptServiceRole,
  [switch]$PromptDbPassword,
  [switch]$PromptAccessToken
)

$ErrorActionPreference = "Stop"

function Read-Secret {
  param([Parameter(Mandatory = $true)][string]$Prompt)

  $secure = Read-Host $Prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Decode-Role {
  param([string]$Jwt)
  if ([string]::IsNullOrWhiteSpace($Jwt)) { return $null }
  $parts = $Jwt.Split('.')
  if ($parts.Length -lt 2) { return $null }
  $payload = $parts[1].Replace('-', '+').Replace('_', '/')
  while (($payload.Length % 4) -ne 0) { $payload += '=' }
  try {
    $json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload))
    $obj = $json | ConvertFrom-Json
    return [string]$obj.role
  } catch {
    return $null
  }
}

# Ensure URL exists
$url = [Environment]::GetEnvironmentVariable('SUPABASE_URL', 'User')
if ([string]::IsNullOrWhiteSpace($url)) {
  $url = "https://$ProjectRef.supabase.co"
  [Environment]::SetEnvironmentVariable('SUPABASE_URL', $url, 'User')
}
$env:SUPABASE_URL = $url

# Service role key
$serviceRole = [Environment]::GetEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY', 'User')
if (($PromptServiceRole -or [string]::IsNullOrWhiteSpace($serviceRole))) {
  $serviceRole = Read-Secret "Supabase SERVICE_ROLE key (JWT)"
  if (-not [string]::IsNullOrWhiteSpace($serviceRole)) {
    [Environment]::SetEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY', $serviceRole, 'User')
  }
}
if (-not [string]::IsNullOrWhiteSpace($serviceRole)) {
  $env:SUPABASE_SERVICE_ROLE_KEY = $serviceRole
}

# DB password
$dbPassword = [Environment]::GetEnvironmentVariable('SUPABASE_DB_PASSWORD', 'User')
if (($PromptDbPassword -or [string]::IsNullOrWhiteSpace($dbPassword))) {
  $dbPassword = Read-Secret "Supabase Postgres DB password"
  if (-not [string]::IsNullOrWhiteSpace($dbPassword)) {
    [Environment]::SetEnvironmentVariable('SUPABASE_DB_PASSWORD', $dbPassword, 'User')
  }
}
if (-not [string]::IsNullOrWhiteSpace($dbPassword)) {
  $env:SUPABASE_DB_PASSWORD = $dbPassword
}

# Access token
$accessToken = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'User')
if (($PromptAccessToken -or [string]::IsNullOrWhiteSpace($accessToken))) {
  $accessToken = Read-Secret "Supabase access token (sbp_...)"
  if (-not [string]::IsNullOrWhiteSpace($accessToken)) {
    [Environment]::SetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', $accessToken, 'User')
  }
}
if (-not [string]::IsNullOrWhiteSpace($accessToken)) {
  $env:SUPABASE_ACCESS_TOKEN = $accessToken
}

$role = Decode-Role -Jwt $serviceRole

Write-Host "Configured Supabase secrets in User env:" -ForegroundColor Cyan
Write-Host "  SUPABASE_URL: set=$(-not [string]::IsNullOrWhiteSpace($url))" -ForegroundColor Gray
Write-Host "  SUPABASE_SERVICE_ROLE_KEY: set=$(-not [string]::IsNullOrWhiteSpace($serviceRole)) len=$([string]::IsNullOrWhiteSpace($serviceRole) ? 0 : $serviceRole.Length) role=$([string]::IsNullOrWhiteSpace($role) ? 'unknown' : $role)" -ForegroundColor Gray
Write-Host "  SUPABASE_DB_PASSWORD: set=$(-not [string]::IsNullOrWhiteSpace($dbPassword)) len=$([string]::IsNullOrWhiteSpace($dbPassword) ? 0 : $dbPassword.Length)" -ForegroundColor Gray
Write-Host "  SUPABASE_ACCESS_TOKEN: set=$(-not [string]::IsNullOrWhiteSpace($accessToken)) len=$([string]::IsNullOrWhiteSpace($accessToken) ? 0 : $accessToken.Length)" -ForegroundColor Gray
