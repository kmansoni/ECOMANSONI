param(
  [string]$AccessToken = "",
  [string]$ProjectRef = "lfkbgnbjxskspsownvjm"
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($AccessToken)) {
  $AccessToken = $env:SUPABASE_ACCESS_TOKEN
  if ([string]::IsNullOrWhiteSpace($AccessToken)) {
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

$sql = @"
SELECT 
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_or_create_dm', 'send_message_v1', 'chat_schema_probe_v2')
ORDER BY p.proname;
"@

$apiUrl = "https://api.supabase.com/v1/projects/$ProjectRef/database/query"

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
  $result = $response.Content | ConvertFrom-Json
  
  Write-Host "=== Database Functions ===" -ForegroundColor Cyan
  $result | ConvertTo-Json -Depth 10 | Write-Host
  
} catch {
  Write-Host "Error:" -ForegroundColor Red
  if ($_.ErrorDetails.Message) {
    Write-Host $_.ErrorDetails.Message -ForegroundColor Yellow
  } else {
    Write-Host $_.Exception.Message -ForegroundColor Yellow
  }
}
