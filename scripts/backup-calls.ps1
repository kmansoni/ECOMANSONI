param(
  [string]$Name = "",
  [string]$OutDir = "reserve/calls/snapshots"
)

$ErrorActionPreference = "Stop"

function Ensure-Dir([string]$path) {
  if (-not (Test-Path $path)) { New-Item -ItemType Directory -Force -Path $path | Out-Null }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $repoRoot
try {
  $stamp = if ($Name -and $Name.Trim().Length -gt 0) { $Name.Trim() } else { (Get-Date).ToString("yyyyMMdd-HHmmss") }
  $dest = Join-Path $repoRoot $OutDir
  Ensure-Dir $dest

  $snapshotRoot = Join-Path $dest $stamp
  Ensure-Dir $snapshotRoot

  $paths = @(
    "src/contexts/VideoCallContext.tsx",
    "src/hooks/useVideoCall.ts",
    "src/hooks/useIncomingCalls.ts",
    "src/lib/webrtc-config.ts",
    "src/lib/sip-config.ts",
    "src/components/chat/GlobalCallOverlay.tsx",
    "supabase/functions/turn-credentials",
    "supabase/functions/sip-credentials",
    "supabase/migrations/20260201205620_81f1f128-d91b-4617-a622-b06681435944.sql",
    "supabase/migrations/20260123041531_09794b5c-2536-4e85-9e81-fb0ceb458c36.sql",
    "supabase/migrations/20260118165423_4a4ce152-1665-4316-bbb4-13b9e3c96024.sql"
  )

  foreach ($p in $paths) {
    $src = Join-Path $repoRoot $p
    if (-not (Test-Path $src)) {
      Write-Warning "Missing path: $p"
      continue
    }

    $target = Join-Path $snapshotRoot $p
    Ensure-Dir (Split-Path $target -Parent)

    if ((Get-Item $src).PSIsContainer) {
      Copy-Item -Recurse -Force $src $target
    } else {
      Copy-Item -Force $src $target
    }
  }

  $gitSha = (git rev-parse HEAD 2>$null)
  if (-not $gitSha) { $gitSha = "unknown" }

  $manifest = [ordered]@{
    created_at = (Get-Date).ToString("o")
    git_sha = $gitSha
    snapshot = $stamp
    paths = $paths
  } | ConvertTo-Json -Depth 5

  $manifestPath = Join-Path $snapshotRoot "manifest.json"
  $manifest | Out-File -Encoding UTF8 $manifestPath

  Write-Host "Calls snapshot created: $snapshotRoot" -ForegroundColor Green
} finally {
  Pop-Location
}
