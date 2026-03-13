param(
  [string]$ProjectRef = "",
  [switch]$FailOnCritical,
  [string]$OutputDir = "",
  [switch]$JsonOnly
)

$ErrorActionPreference = 'Stop'

function Resolve-ProjectRef([string]$PreferredRef, [string]$repoRoot) {
  if (-not [string]::IsNullOrWhiteSpace($PreferredRef)) { return $PreferredRef.Trim() }

  $linkedRefPath = Join-Path $repoRoot 'supabase\.temp\project-ref'
  if (Test-Path -LiteralPath $linkedRefPath) {
    $linked = (Get-Content -LiteralPath $linkedRefPath -Raw -Encoding UTF8).Trim()
    if (-not [string]::IsNullOrWhiteSpace($linked)) { return $linked }
  }

  $configPath = Join-Path $repoRoot 'supabase\config.toml'
  if (Test-Path -LiteralPath $configPath) {
    $line = Get-Content -LiteralPath $configPath | Where-Object { $_ -match '^\s*project_id\s*=\s*"([a-z0-9-]+)"\s*$' } | Select-Object -First 1
    if (-not [string]::IsNullOrWhiteSpace($line)) {
      $m = [regex]::Match($line, '^\s*project_id\s*=\s*"([a-z0-9-]+)"\s*$')
      if ($m.Success) { return $m.Groups[1].Value }
    }
  }

  throw 'Project ref is missing. Set -ProjectRef, link project, or set project_id in supabase/config.toml.'
}

function Resolve-AccessToken {
  if (-not [string]::IsNullOrWhiteSpace($env:SUPABASE_ACCESS_TOKEN)) {
    return $env:SUPABASE_ACCESS_TOKEN.Trim()
  }

  $user = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'User')
  if (-not [string]::IsNullOrWhiteSpace($user)) { return $user.Trim() }

  $machine = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'Machine')
  if (-not [string]::IsNullOrWhiteSpace($machine)) { return $machine.Trim() }

  throw 'SUPABASE_ACCESS_TOKEN is missing.'
}

function Invoke-DbQuery([string]$ApiUrl, [hashtable]$Headers, [string]$Query) {
  $body = @{ query = $Query } | ConvertTo-Json -Compress
  $attempt = 0

  while ($true) {
    $attempt++
    try {
      $resp = Invoke-WebRequest -Uri $ApiUrl -Method Post -Headers $Headers -Body $body -ErrorAction Stop
      return ($resp.Content | ConvertFrom-Json)
    } catch {
      if ($attempt -ge 4) { throw }
      Start-Sleep -Seconds ([Math]::Pow(2, $attempt))
    }
  }
}

function Read-Allowlist([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    return @()
  }

  return @(
    Get-Content -LiteralPath $Path -Encoding UTF8 |
      ForEach-Object { $_.Trim() } |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) -and -not $_.StartsWith('#') }
  )
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$resolvedProjectRef = Resolve-ProjectRef -PreferredRef $ProjectRef -repoRoot $repoRoot
$token = Resolve-AccessToken

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $OutputDir = Join-Path $repoRoot 'tmp\security\generated'
}

if (-not (Test-Path -LiteralPath $OutputDir)) {
  New-Item -Path $OutputDir -ItemType Directory -Force | Out-Null
}

$api = "https://api.supabase.com/v1/projects/$resolvedProjectRef/database/query"
$headers = @{
  Authorization = "Bearer $token"
  apikey = $token
  'Content-Type' = 'application/json'
}

# 1) SECURITY DEFINER posture and execute grants.
$sdFns = @(
  Invoke-DbQuery -ApiUrl $api -Headers $headers -Query @"
select
  n.nspname as schema_name,
  p.proname as function_name,
  p.oid::regprocedure::text as signature,
  coalesce(bool_or(r.rolname = 'anon' and x.privilege_type = 'EXECUTE'), false) as anon_exec,
  coalesce(bool_or(r.rolname = 'authenticated' and x.privilege_type = 'EXECUTE'), false) as authenticated_exec,
  coalesce(bool_or(r.rolname = 'service_role' and x.privilege_type = 'EXECUTE'), false) as service_role_exec
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
left join aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x on true
left join pg_roles r on r.oid = x.grantee
where p.prosecdef = true
  and n.nspname not in ('pg_catalog', 'information_schema')
group by n.nspname, p.proname, p.oid
order by n.nspname, p.proname, p.oid::regprocedure::text;
"@
)

$sdTotal = $sdFns.Count
$sdAnonExec = @($sdFns | Where-Object { $_.anon_exec -eq $true }).Count
$sdAuthenticatedExec = @($sdFns | Where-Object { $_.authenticated_exec -eq $true }).Count

$allowlistsDir = Join-Path $repoRoot 'scripts\security\allowlists'
$sdAllowlistSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$rlsExemptSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$truePolicyAllowlistSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

foreach ($s in (Read-Allowlist -Path (Join-Path $allowlistsDir 'security-definer-execute-allowlist.txt'))) {
  [void]$sdAllowlistSet.Add($s)
}

foreach ($t in (Read-Allowlist -Path (Join-Path $allowlistsDir 'public-rls-exempt-tables.txt'))) {
  [void]$rlsExemptSet.Add($t)
}

foreach ($p in (Read-Allowlist -Path (Join-Path $allowlistsDir 'true-policy-allowlist.txt'))) {
  [void]$truePolicyAllowlistSet.Add($p)
}

$actionableSd = @(
  $sdFns | Where-Object {
    ($_.anon_exec -eq $true -or $_.authenticated_exec -eq $true) -and
    (-not $sdAllowlistSet.Contains([string]$_.signature))
  }
)
$actionableSdCount = $actionableSd.Count

# 2) Public tables without RLS.
$publicRls = @(
  Invoke-DbQuery -ApiUrl $api -Headers $headers -Query @"
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and c.relpersistence <> 't'
order by c.relname;
"@
)

$publicTablesTotal = $publicRls.Count
$publicTablesRlsDisabled = @($publicRls | Where-Object { $_.rls_enabled -ne $true })
$publicTablesRlsDisabledCount = $publicTablesRlsDisabled.Count
$actionablePublicTablesRlsDisabled = @(
  $publicTablesRlsDisabled | Where-Object {
    $key = "$(($_.schema_name)).$(($_.table_name))"
    -not $rlsExemptSet.Contains($key)
  }
)
$actionablePublicTablesRlsDisabledCount = $actionablePublicTablesRlsDisabled.Count

# 3) Policies with bare true predicates.
$truePolicies = @(
  Invoke-DbQuery -ApiUrl $api -Headers $headers -Query @"
select
  schemaname as schema_name,
  tablename as table_name,
  policyname as policy_name,
  permissive,
  cmd,
  roles,
  coalesce(qual, '') as using_expr,
  coalesce(with_check, '') as with_check_expr
from pg_policies
where lower(regexp_replace(coalesce(qual, ''), '\\s+', '', 'g')) in ('true', '(true)')
  or lower(regexp_replace(coalesce(with_check, ''), '\\s+', '', 'g')) in ('true', '(true)')
order by schemaname, tablename, policyname;
"@
)
$truePoliciesCount = $truePolicies.Count
$actionableTruePolicies = @(
  $truePolicies | Where-Object {
    $key = "$(($_.schema_name)).$(($_.table_name)).$(($_.policy_name))"
    -not $truePolicyAllowlistSet.Contains($key)
  }
)
$actionableTruePoliciesCount = $actionableTruePolicies.Count

# 4) send_message_v1 signature health.
$sendMessageOverloads = @(
  Invoke-DbQuery -ApiUrl $api -Headers $headers -Query @"
select p.oid::regprocedure::text as signature
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'send_message_v1'
order by signature;
"@
)

$sendMessageV1OverloadsCount = $sendMessageOverloads.Count

$timestamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$report = [PSCustomObject]@{
  generated_at_utc = $timestamp
  project_ref = $resolvedProjectRef
  summary = [PSCustomObject]@{
    security_definer_total = $sdTotal
    security_definer_anon_exec = $sdAnonExec
    security_definer_authenticated_exec = $sdAuthenticatedExec
    public_tables_total = $publicTablesTotal
    public_tables_rls_disabled = $publicTablesRlsDisabledCount
    true_policies_total = $truePoliciesCount
    actionable_security_definer_exec = $actionableSdCount
    actionable_public_tables_rls_disabled = $actionablePublicTablesRlsDisabledCount
    actionable_true_policies_total = $actionableTruePoliciesCount
    send_message_v1_overloads = $sendMessageV1OverloadsCount
  }
  details = [PSCustomObject]@{
    security_definer_functions = $sdFns
    public_tables_rls_disabled = $publicTablesRlsDisabled
    true_policies = $truePolicies
    actionable_security_definer_functions = $actionableSd
    actionable_public_tables_rls_disabled = $actionablePublicTablesRlsDisabled
    actionable_true_policies = $actionableTruePolicies
    send_message_v1_signatures = $sendMessageOverloads
  }
}

$jsonPath = Join-Path $OutputDir 'critical-audit.json'
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $jsonPath -Encoding UTF8

if (-not $JsonOnly) {
  $mdPath = Join-Path $OutputDir 'critical-audit.md'
  $lines = New-Object System.Collections.Generic.List[string]

  $lines.Add('# Supabase Critical Security Audit')
  $lines.Add('')
  $lines.Add("Generated (UTC): $timestamp")
  $lines.Add("Project: $resolvedProjectRef")
  $lines.Add('')
  $lines.Add('## Summary')
  $lines.Add('')
  $lines.Add("- SECURITY DEFINER total: $sdTotal")
  $lines.Add("- SECURITY DEFINER executable by anon: $sdAnonExec")
  $lines.Add("- SECURITY DEFINER executable by authenticated: $sdAuthenticatedExec")
  $lines.Add("- Public tables total: $publicTablesTotal")
  $lines.Add("- Public tables without RLS: $publicTablesRlsDisabledCount")
  $lines.Add("- Policies with USING/WITH CHECK true: $truePoliciesCount")
  $lines.Add("- Actionable SECURITY DEFINER exec (non-allowlisted): $actionableSdCount")
  $lines.Add("- Actionable public tables without RLS (non-exempt): $actionablePublicTablesRlsDisabledCount")
  $lines.Add("- Actionable true policies (non-allowlisted): $actionableTruePoliciesCount")
  $lines.Add("- send_message_v1 overload signatures: $sendMessageV1OverloadsCount")
  $lines.Add('')

  if ($actionableSdCount -gt 0) {
    $lines.Add('## Actionable SECURITY DEFINER Exec')
    $lines.Add('')
    foreach ($f in $actionableSd) {
      $lines.Add("- $($f.signature) :: anon_exec=$($f.anon_exec) :: authenticated_exec=$($f.authenticated_exec)")
    }
    $lines.Add('')
  }

  if ($actionablePublicTablesRlsDisabledCount -gt 0) {
    $lines.Add('## Actionable Public Tables Without RLS')
    $lines.Add('')
    foreach ($t in $actionablePublicTablesRlsDisabled) {
      $lines.Add("- $($t.schema_name).$($t.table_name)")
    }
    $lines.Add('')
  }

  if ($actionableTruePoliciesCount -gt 0) {
    $lines.Add('## Actionable Policies With Bare True Predicates')
    $lines.Add('')
    foreach ($p in $actionableTruePolicies) {
      $usingExpr = if ([string]::IsNullOrWhiteSpace([string]$p.using_expr)) { '-' } else { [string]$p.using_expr }
      $checkExpr = if ([string]::IsNullOrWhiteSpace([string]$p.with_check_expr)) { '-' } else { [string]$p.with_check_expr }
      $lines.Add("- $($p.schema_name).$($p.table_name) :: $($p.policy_name) :: cmd=$($p.cmd) :: using=$usingExpr :: with_check=$checkExpr")
    }
    $lines.Add('')
  }

  if ($publicTablesRlsDisabledCount -gt 0) {
    $lines.Add('## Public Tables Without RLS')
    $lines.Add('')
    foreach ($t in $publicTablesRlsDisabled) {
      $lines.Add("- $($t.schema_name).$($t.table_name)")
    }
    $lines.Add('')
  }

  if ($truePoliciesCount -gt 0) {
    $lines.Add('## Policies With Bare True Predicates')
    $lines.Add('')
    foreach ($p in $truePolicies) {
      $usingExpr = if ([string]::IsNullOrWhiteSpace([string]$p.using_expr)) { '-' } else { [string]$p.using_expr }
      $checkExpr = if ([string]::IsNullOrWhiteSpace([string]$p.with_check_expr)) { '-' } else { [string]$p.with_check_expr }
      $lines.Add("- $($p.schema_name).$($p.table_name) :: $($p.policy_name) :: cmd=$($p.cmd) :: using=$usingExpr :: with_check=$checkExpr")
    }
    $lines.Add('')
  }

  if ($sendMessageV1OverloadsCount -gt 0) {
    $lines.Add('## send_message_v1 Signatures')
    $lines.Add('')
    foreach ($s in $sendMessageOverloads) {
      $lines.Add("- $($s.signature)")
    }
    $lines.Add('')
  }

  Set-Content -LiteralPath $mdPath -Encoding UTF8 -Value $lines
}

Write-Host "Critical audit JSON: $jsonPath" -ForegroundColor Green
if (-not $JsonOnly) {
  Write-Host "Critical audit Markdown: $(Join-Path $OutputDir 'critical-audit.md')" -ForegroundColor Green
}

if ($FailOnCritical) {
  $hasCritical = (
    $actionableSdCount -gt 0 -or
    $actionablePublicTablesRlsDisabledCount -gt 0 -or
    $actionableTruePoliciesCount -gt 0 -or
    $sendMessageV1OverloadsCount -gt 1
  )

  if ($hasCritical) {
    Write-Host 'Critical security gate failed.' -ForegroundColor Red
    exit 2
  }
}

exit 0
