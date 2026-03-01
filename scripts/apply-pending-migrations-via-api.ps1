param(
  [string]$ProjectRef = "lfkbgnbjxskspsownvjm"
)

$ErrorActionPreference = 'Stop'

$pending = @(
  '20260228183000_email_router_inbound_inbox.sql',
  '20260228190000_email_router_threads_and_read_state.sql',
  '20260228193000_bots_and_mini_apps.sql',
  '20260229000000_crm_core.sql',
  '20260229000001_phase1_chat_features_b076_b077_b097_b098.sql',
  '20260229001000_crm_rpc.sql'
)

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
if ([string]::IsNullOrWhiteSpace($token)) {
  $token = Read-Secret 'Supabase access token (sbp_...)'
}

if ([string]::IsNullOrWhiteSpace($token)) {
  throw 'Supabase access token is empty.'
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

Write-Host "Checking schema_migrations columns..." -ForegroundColor Cyan
$cols = Invoke-DbQuery "select column_name from information_schema.columns where table_schema='supabase_migrations' and table_name='schema_migrations' order by ordinal_position;"
$colNames = @($cols | ForEach-Object { $_.column_name })
Write-Host ("columns: " + ($colNames -join ', ')) -ForegroundColor Gray

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
foreach ($file in $pending) {
  $path = Join-Path $repoRoot ("supabase/migrations/" + $file)
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Migration file not found: $path"
  }

  $version = ($file -split '_')[0]
  $name = ($file.Substring($version.Length + 1) -replace '\\.sql$','')
  $sql = Get-Content -LiteralPath $path -Raw -Encoding UTF8

  Write-Host "Applying $file" -ForegroundColor Yellow
  [void](Invoke-DbQuery $sql)

  $mark = "insert into supabase_migrations.schema_migrations(version) values ('$version') on conflict do nothing;"
  if ($colNames -contains 'name' -and $colNames -contains 'statements') {
    $mark = "insert into supabase_migrations.schema_migrations(version,name,statements) values ('$version','$name',ARRAY[]::text[]) on conflict do nothing;"
  } elseif ($colNames -contains 'name') {
    $mark = "insert into supabase_migrations.schema_migrations(version,name) values ('$version','$name') on conflict do nothing;"
  }

  [void](Invoke-DbQuery $mark)
  Write-Host "Applied and marked $version" -ForegroundColor Green
}

Write-Host 'All pending migrations applied via API.' -ForegroundColor Green
