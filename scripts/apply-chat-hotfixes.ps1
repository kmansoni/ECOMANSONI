param(
  [string]$AccessToken = "",
  [string]$ProjectRef = "lfkbgnbjxskspsownvjm"
)

$ErrorActionPreference = 'Stop'

# Try to get access token from multiple sources
function Get-SupabaseAccessToken {
  param([string]$ProvidedToken)
  
  # 1. Check if provided as parameter
  if (-not [string]::IsNullOrWhiteSpace($ProvidedToken)) {
    Write-Host "✓ Using access token from parameter" -ForegroundColor Green
    return $ProvidedToken
  }
  
  # 2. Check environment variable
  if (-not [string]::IsNullOrWhiteSpace($env:SUPABASE_ACCESS_TOKEN)) {
    Write-Host "✓ Using access token from SUPABASE_ACCESS_TOKEN env var" -ForegroundColor Green
    return $env:SUPABASE_ACCESS_TOKEN
  }
  
  Write-Host "ℹ Access token not found in environment." -ForegroundColor Yellow
  
  # 3. Prompt user
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
  
  return $token
}

function Apply-SqlViaApi {
  param(
    [string]$SqlFilePath,
    [string]$Token,
    [string]$ProjectRef
  )
  
  if (-not (Test-Path -LiteralPath $SqlFilePath)) {
    throw "SQL file not found: $SqlFilePath"
  }
  
  $sql = Get-Content -LiteralPath $SqlFilePath -Raw -Encoding UTF8
  $apiUrl = "https://api.supabase.com/v1/projects/$ProjectRef/database/query"
  
  Write-Host "`n📝 Applying: $([System.IO.Path]::GetFileName($SqlFilePath))" -ForegroundColor Cyan
  
  $headers = @{
    'Authorization' = "Bearer $Token"
    'Content-Type' = 'application/json'
    'apikey' = $Token
  }
  
  $body = @{
    'query' = $sql
  } | ConvertTo-Json -Compress
  
  try {
    $response = Invoke-WebRequest -Uri $apiUrl -Method Post -Headers $headers -Body $body -ErrorAction Stop
    Write-Host "✓ Successfully applied!" -ForegroundColor Green
    return $true
  } catch {
    Write-Host "✗ Failed to apply migration" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
      try {
        $errorJson = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($errorJson.message) {
          Write-Host "Error: $($errorJson.message)" -ForegroundColor Yellow
        } else {
          Write-Host "Error: $($_.ErrorDetails.Message)" -ForegroundColor Yellow
        }
      } catch {
        Write-Host "Error: $($_.ErrorDetails.Message)" -ForegroundColor Yellow
      }
    } else {
      Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Yellow
    }
    return $false
  }
}

# Main execution
Write-Host "=== Supabase Hotfix Migration Tool ===" -ForegroundColor Cyan
Write-Host "Project: $ProjectRef`n" -ForegroundColor Gray

$token = Get-SupabaseAccessToken -ProvidedToken $AccessToken

$hotfixes = @(
  ".\scripts\.temp\hotfix-chat-inbox-api.sql",
  ".\scripts\.temp\hotfix-send-message-v1-api.sql",
  ".\scripts\.temp\hotfix-schema-probe-v2.sql"
)

$successCount = 0
$failCount = 0

foreach ($hotfix in $hotfixes) {
  if (Test-Path -LiteralPath $hotfix) {
    $result = Apply-SqlViaApi -SqlFilePath $hotfix -Token $token -ProjectRef $ProjectRef
    if ($result) {
      $successCount++
    } else {
      $failCount++
    }
  } else {
    Write-Host "⚠ Skipping (not found): $hotfix" -ForegroundColor Yellow
  }
}

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
Write-Host "✓ Success: $successCount" -ForegroundColor Green
Write-Host "✗ Failed: $failCount" -ForegroundColor Red

if ($failCount -eq 0) {
  Write-Host "`n🎉 All hotfixes applied successfully!" -ForegroundColor Green
  exit 0
} else {
  Write-Host "`n⚠ Some migrations failed. Please review errors above." -ForegroundColor Yellow
  exit 1
}
