param(
  [Parameter(Mandatory = $true)]
  [string]$MigrationFile,
  [string]$ProjectRef = "lfkbgnbjxskspsownvjm"
)

$ErrorActionPreference = 'Stop'

# Запросить access token
$tokenSecure = Read-Host "Supabase access token (sbp_...)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($tokenSecure)
try {
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

if ([string]::IsNullOrWhiteSpace($token)) {
  throw "Access token is required"
}

# Прочитать SQL из файла
if (-not (Test-Path -LiteralPath $MigrationFile)) {
  throw "Migration file not found: $MigrationFile"
}

$sql = Get-Content -LiteralPath $MigrationFile -Raw -Encoding UTF8

# Выполнить через Supabase Management API
$apiUrl = "https://api.supabase.com/v1/projects/$ProjectRef/database/query"

Write-Host "Executing SQL via Supabase Management API..." -ForegroundColor Cyan
Write-Host "API URL: $apiUrl" -ForegroundColor Gray

$headers = @{
  'Authorization' = "Bearer $token"
  'Content-Type' = 'application/json'
  'apikey' = $token
}

$body = @{
  'query' = $sql
} | ConvertTo-Json -Compress

try {
  $response = Invoke-WebRequest -Uri $apiUrl -Method Post -Headers $headers -Body $body -ErrorAction Stop
  Write-Host "✓ Migration applied successfully!" -ForegroundColor Green
  Write-Host "Response:" -ForegroundColor Gray
  $response.Content | Write-Host
  exit 0
} catch {
  Write-Host "✗ Failed to apply migration:" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  if ($_.ErrorDetails.Message) {
    Write-Host "Details:" -ForegroundColor Yellow
    Write-Host $_.ErrorDetails.Message
  }
  exit 1
}
