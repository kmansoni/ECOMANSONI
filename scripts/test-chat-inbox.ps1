param(
  [string]$ProjectRef = "lfkbgnbjxskspsownvjm",
  [string]$SupabaseUrl = "https://lfkbgnbjxskspsownvjm.supabase.co"
)

$ErrorActionPreference = 'Stop'

# Запросить service_role_key
$keySecure = Read-Host "Supabase service_role key (eyJ...)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($keySecure)
try {
  $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

if ([string]::IsNullOrWhiteSpace($key)) {
  throw "Service role key is required"
}

# Check chat_get_inbox_v2 function
$apiUrl = "$SupabaseUrl/rest/v1/rpc/chat_get_inbox_v2"

Write-Host "Testing chat_get_inbox_v2 at: $apiUrl" -ForegroundColor Cyan

$headers = @{
  'apikey' = $key
  'Authorization' = "Bearer $key"
  'Content-Type' = 'application/json'
}

$body = @{
  'p_limit' = 10
} | ConvertTo-Json

try {
  $response = Invoke-WebRequest -Uri $apiUrl -Method Post -Headers $headers -Body $body -ErrorAction Stop
  Write-Host "✓ Function works! Status: $($response.StatusCode)" -ForegroundColor Green
  Write-Host "Response:" -ForegroundColor Gray
  $response.Content | Write-Host
  exit 0
} catch {
  Write-Host "✗ Function call failed:" -ForegroundColor Red
  Write-Host "Status: $($_.Exception.Response.StatusCode)" -ForegroundColor Yellow 
  if ($_.ErrorDetails.Message) {
    Write-Host "Error:" -ForegroundColor Yellow
    Write-Host $_.ErrorDetails.Message
  }
  exit 1
}
