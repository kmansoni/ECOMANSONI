param(
  [string]$ProjectRef = "lfkbgnbjxskspsownvjm",
  [switch]$PromptToken
)

$ErrorActionPreference = 'Stop'

function Read-Secret([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
  return ($value.Trim().Trim('"').Trim("'").Replace("`r",'').Replace("`n",'').Replace(' ',''))
}

$token = $env:SUPABASE_ACCESS_TOKEN
if ([string]::IsNullOrWhiteSpace($token)) {
  $token = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'User')
}
if ([string]::IsNullOrWhiteSpace($token) -and $PromptToken) {
  $token = Read-Secret 'Supabase access token (sbp_...)'
}
if ([string]::IsNullOrWhiteSpace($token)) {
  throw 'SUPABASE_ACCESS_TOKEN is not set. Use -PromptToken or set it in User env.'
}

$api = "https://api.supabase.com/v1/projects/$ProjectRef/database/query"
$headers = @{
  Authorization = "Bearer $token"
  apikey = $token
  'Content-Type' = 'application/json'
}

function Invoke-DbQuery([string]$query) {
  $body = @{ query = $query } | ConvertTo-Json -Compress
  $resp = Invoke-WebRequest -Uri $api -Method Post -Headers $headers -Body $body -ErrorAction Stop
  return ($resp.Content | ConvertFrom-Json)
}

$requiredVersions = @('20260303150000','20260304060000','20260304103000')
$requiredFunctions = @('disable_conversation_encryption','enable_conversation_encryption')

Write-Host 'Checking E2EE RPC functions...' -ForegroundColor Cyan
$functions = Invoke-DbQuery @"
select p.proname as name,
       pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('disable_conversation_encryption','enable_conversation_encryption')
order by p.proname;
"@

$funcNames = @($functions | ForEach-Object { $_.name })
$missingFunctions = $requiredFunctions | Where-Object { $_ -notin $funcNames }

Write-Host 'Checking E2EE migration versions...' -ForegroundColor Cyan
$versions = Invoke-DbQuery @"
select version
from supabase_migrations.schema_migrations
where version in ('20260303150000','20260304060000','20260304103000')
order by version;
"@

$versionNames = @($versions | ForEach-Object { $_.version })
$missingVersions = $requiredVersions | Where-Object { $_ -notin $versionNames }

Write-Host '--- Functions ---' -ForegroundColor Gray
$functions | Format-Table -AutoSize | Out-Host
Write-Host '--- Versions ---' -ForegroundColor Gray
$versions | Format-Table -AutoSize | Out-Host

if ($missingFunctions.Count -gt 0 -or $missingVersions.Count -gt 0) {
  $parts = @()
  if ($missingFunctions.Count -gt 0) { $parts += ('Missing functions: ' + ($missingFunctions -join ', ')) }
  if ($missingVersions.Count -gt 0) { $parts += ('Missing versions: ' + ($missingVersions -join ', ')) }
  throw ('E2EE version check failed. ' + ($parts -join ' | '))
}

Write-Host 'E2EE version check passed.' -ForegroundColor Green
