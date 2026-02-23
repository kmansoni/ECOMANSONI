param(
  [Parameter(Mandatory = $true)]
  [string]$MigrationFile,
  [string]$ProjectRef = "lfkbgnbjxskspsownvjm",
  [string]$AccessToken = ""
)

$ErrorActionPreference = 'Stop'

# Попробовать получить токен из окружения или GitHub secret
if ([string]::IsNullOrWhiteSpace($AccessToken)) {
  # Попытка 1: Переменная окружения
  $AccessToken = $env:SUPABASE_ACCESS_TOKEN
  
  # Попытка 2: Прочитать из GitHub (если локально)
  if ([string]::IsNullOrWhiteSpace($AccessToken)) {
    Write-Host "Access token not found in environment." -ForegroundColor Yellow
    Write-Host "Please provide it via -AccessToken parameter or SUPABASE_ACCESS_TOKEN env var." -ForegroundColor Yellow
    
    # Запросить интерактивно
    $tokenSecure = Read-Host "Supabase access token (sbp_...)" -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($tokenSecure)
    try {
      $AccessToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
  }
}

if ([string]::IsNullOrWhiteSpace($AccessToken)) {
  throw "Access token is required"
}

if (-not (Test-Path -LiteralPath $MigrationFile)) {
  throw "Migration file not found: $MigrationFile"
}

$sql = Get-Content -LiteralPath $MigrationFile -Raw -Encoding UTF8
$apiUrl = "https://api.supabase.com/v1/projects/$ProjectRef/database/query"

Write-Host "Executing SQL via Supabase Management API..." -ForegroundColor Cyan
Write-Host "File: $MigrationFile" -ForegroundColor Gray

$headers = @{
  'Authorization' = "Bearer $AccessToken"
  'Content-Type' = 'application/json'
  'apikey' = $AccessToken
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
