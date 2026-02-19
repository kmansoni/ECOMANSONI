param(
  [string]$From = "reserve/calls/baseline",
  [switch]$Force
)

$ErrorActionPreference = "Stop"

function Ensure-Dir([string]$path) {
  if (-not (Test-Path $path)) { New-Item -ItemType Directory -Force -Path $path | Out-Null }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $repoRoot
try {
  $sourceRoot = Join-Path $repoRoot $From
  if (-not (Test-Path $sourceRoot)) {
    Write-Error "Reserve not found: $From"
    exit 1
  }

  if (-not $Force) {
    $status = (git status --porcelain 2>$null)
    if ($status -and $status.Trim().Length -gt 0) {
      Write-Error "Working tree is not clean. Commit/stash changes or run with -Force."
      exit 1
    }
  }

  # Restore all files under the reserve root, preserving relative paths.
  $items = Get-ChildItem -Recurse -File -Path $sourceRoot
  foreach ($item in $items) {
    $rel = $item.FullName.Substring($sourceRoot.Path.Length).TrimStart([IO.Path]::DirectorySeparatorChar)
    $dest = Join-Path $repoRoot $rel
    Ensure-Dir (Split-Path $dest -Parent)
    Copy-Item -Force $item.FullName $dest
  }

  Write-Host "Calls restored from: $From" -ForegroundColor Green
  Write-Host "Note: Supabase Secrets (TURN/SIP credentials) are not restored by this script." -ForegroundColor Yellow
} finally {
  Pop-Location
}
