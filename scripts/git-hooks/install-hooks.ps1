param()

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\.."))
Push-Location $repoRoot
try {
  git config core.hooksPath .githooks
  Write-Host "Installed git hooks: core.hooksPath=.githooks" -ForegroundColor Green
} finally {
  Pop-Location
}
