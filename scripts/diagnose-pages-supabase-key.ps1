$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$site = 'https://kmansoni.github.io/ECOMANSONI/'
$html = (Invoke-WebRequest -UseBasicParsing $site).Content

$scriptMatch = [regex]::Match($html, 'src="(/ECOMANSONI/assets/index-[^"]+\.js)"')
if (-not $scriptMatch.Success) {
  Write-Output 'bundle=not-found'
  exit 1
}

$bundlePath = $scriptMatch.Groups[1].Value
$bundleUrl = 'https://kmansoni.github.io' + $bundlePath
$js = (Invoke-WebRequest -UseBasicParsing $bundleUrl).Content

$projectHost = 'lfkbgnbjxskspsownvjm.supabase.co'
$idx = $js.IndexOf($projectHost)
if ($idx -lt 0) {
  Write-Output "bundle=$bundlePath"
  Write-Output 'supabaseUrlIndexNotFound=true'
  exit 0
}

$start = [Math]::Max(0, $idx - 800)
$len = [Math]::Min(4000, $js.Length - $start)
$snippet = $js.Substring($start, $len)

$jwt = [regex]::Match($snippet, 'eyJ[0-9A-Za-z_\-\.]{20,}')
$sbp = [regex]::Match($snippet, 'sb_[0-9A-Za-z_\-]{10,}')

Write-Output "bundle=$bundlePath"
Write-Output "hasJwt=$($jwt.Success)"
if ($jwt.Success) {
  $prefixLen = [Math]::Min(12, $jwt.Value.Length)
  $dotCount = ([regex]::Matches($jwt.Value, '\.')).Count
  Write-Output "jwtPrefix=$($jwt.Value.Substring(0, $prefixLen))"
  Write-Output "jwtDots=$dotCount"
  Write-Output "jwtLen=$($jwt.Value.Length)"
}
Write-Output "hasSb=$($sbp.Success)"
if ($sbp.Success) {
  $prefixLen = [Math]::Min(12, $sbp.Value.Length)
  Write-Output "sbPrefix=$($sbp.Value.Substring(0, $prefixLen))"
  Write-Output "sbLen=$($sbp.Value.Length)"
}

# Output a redacted context header (no secrets)
$redacted = $snippet `
  -replace 'eyJ[0-9A-Za-z_\-\.]{20,}', '<REDACTED_JWT>' `
  -replace 'sb_[0-9A-Za-z_\-]{10,}', '<REDACTED_SB>' `
  -replace 'postgres(ql)?://[^"\s]{10,}', '<REDACTED_DB_URL>'

Write-Output 'contextHead='
Write-Output ($redacted.Substring(0, [Math]::Min(500, $redacted.Length)))
