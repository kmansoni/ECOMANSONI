param(
  [string]$AuditJsonPath = "",
  [string]$SecurityDefinerAllowlistPath = "",
  [string]$TruePolicyAllowlistPath = "",
  [ValidateSet('client-runtime','all')]
  [string]$ScanMode = 'client-runtime'
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if ([string]::IsNullOrWhiteSpace($AuditJsonPath)) {
  $AuditJsonPath = Join-Path $repoRoot 'tmp\security\generated\critical-audit.json'
}
if ([string]::IsNullOrWhiteSpace($SecurityDefinerAllowlistPath)) {
  $SecurityDefinerAllowlistPath = Join-Path $repoRoot 'scripts\security\allowlists\security-definer-execute-allowlist.txt'
}
if ([string]::IsNullOrWhiteSpace($TruePolicyAllowlistPath)) {
  $TruePolicyAllowlistPath = Join-Path $repoRoot 'scripts\security\allowlists\true-policy-allowlist.txt'
}

if (-not (Test-Path -LiteralPath $AuditJsonPath)) {
  throw "Audit JSON not found: $AuditJsonPath"
}

$audit = Get-Content -LiteralPath $AuditJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
$securityDefinerFns = @($audit.details.security_definer_functions)
$truePolicies = @($audit.details.true_policies)

# 1) Collect RPC names that are actually called by code.
$scanDirs = @()
if ($ScanMode -eq 'all') {
  $scanDirs = @('src', 'services', 'infra', 'apps')
} else {
  # Production-safe default: only frontend runtime source, excluding tests.
  $scanDirs = @('src')
}

$scanDirs = $scanDirs | ForEach-Object { Join-Path $repoRoot $_ } | Where-Object { Test-Path -LiteralPath $_ }
$rpcRegex = [regex]::new('\.rpc\(\s*["''](?<name>[a-zA-Z0-9_]+)["'']', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
$rpcNames = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)

# Never auto-allow these sensitive RPCs; require manual review.
$sensitiveRpcDeny = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
[void]$sensitiveRpcDeny.Add('send_internal_sms_v1')

foreach ($dir in $scanDirs) {
  $files = Get-ChildItem -LiteralPath $dir -Recurse -File -Include *.ts,*.tsx,*.js,*.mjs,*.cjs
  foreach ($file in $files) {
    if ($ScanMode -eq 'client-runtime') {
      $normalizedPath = $file.FullName.Replace('\\', '/').ToLowerInvariant()
      if (
        $normalizedPath.Contains('/src/test/') -or
        $normalizedPath.Contains('/__tests__/') -or
        $normalizedPath.EndsWith('.test.ts') -or
        $normalizedPath.EndsWith('.test.tsx') -or
        $normalizedPath.EndsWith('.spec.ts') -or
        $normalizedPath.EndsWith('.spec.tsx')
      ) {
        continue
      }
    }

    $content = $null
    try {
      $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8 -ErrorAction Stop
    } catch {
      continue
    }
    if ([string]::IsNullOrEmpty($content)) {
      continue
    }
    $rpcHits = $rpcRegex.Matches($content)
    foreach ($m in $rpcHits) {
      $name = [string]$m.Groups['name'].Value
      if (-not [string]::IsNullOrWhiteSpace($name)) {
        [void]$rpcNames.Add($name)
      }
    }
  }
}

# 2) Seed SECURITY DEFINER allowlist: only functions that are BOTH
#    (a) currently executable by anon/authenticated and
#    (b) referenced by code via RPC.
$sdSeed = @(
  $securityDefinerFns | Where-Object {
    $null -ne $_ -and
    [string]::IsNullOrWhiteSpace([string]$_.function_name) -eq $false -and
    [string]::IsNullOrWhiteSpace([string]$_.signature) -eq $false -and
    (($_.anon_exec -eq $true) -or ($_.authenticated_exec -eq $true)) -and
    $rpcNames.Contains([string]$_.function_name) -and
    (-not $sensitiveRpcDeny.Contains([string]$_.function_name))
  } | ForEach-Object { [string]$_.signature } | Sort-Object -Unique
)

$sdLines = New-Object System.Collections.Generic.List[string]
$sdLines.Add('# Auto-seeded from code RPC usage + critical audit.')
$sdLines.Add('# Review before production apply.')
$sdLines.Add('# One regprocedure per line.')
$sdLines.Add('')
foreach ($sig in $sdSeed) {
  $sdLines.Add($sig)
}

Set-Content -LiteralPath $SecurityDefinerAllowlistPath -Encoding UTF8 -Value $sdLines

# 3) Seed true-policy allowlist with likely intentional public-read policies.
$readKeywords = '(anyone|public|read|readable|visible|discover|trending|catalog|search|feed|explore)'
$policySeed = @(
  $truePolicies | Where-Object {
    $null -ne $_ -and
    [string]::IsNullOrWhiteSpace([string]$_.schema_name) -eq $false -and
    [string]::IsNullOrWhiteSpace([string]$_.table_name) -eq $false -and
    [string]::IsNullOrWhiteSpace([string]$_.policy_name) -eq $false -and
    ([string]$_.cmd -match 'SELECT') -and
    (
      ([string]$_.policy_name -match $readKeywords) -or
      ([string]$_.using_expr -match $readKeywords)
    )
  } | ForEach-Object { "$($_.schema_name).$($_.table_name).$($_.policy_name)" } | Sort-Object -Unique
)

$policyLines = New-Object System.Collections.Generic.List[string]
$policyLines.Add('# Auto-seeded from critical audit: likely intentional public-read true policies.')
$policyLines.Add('# Review each entry before production apply.')
$policyLines.Add('# One schema.table.policy_name per line.')
$policyLines.Add('')
foreach ($p in $policySeed) {
  $policyLines.Add($p)
}

Set-Content -LiteralPath $TruePolicyAllowlistPath -Encoding UTF8 -Value $policyLines

Write-Host "Seeded SECURITY DEFINER allowlist entries: $($sdSeed.Count)" -ForegroundColor Green
Write-Host "Seeded true-policy allowlist entries: $($policySeed.Count)" -ForegroundColor Green
Write-Host "RPC names discovered in code: $($rpcNames.Count)" -ForegroundColor Green

exit 0
