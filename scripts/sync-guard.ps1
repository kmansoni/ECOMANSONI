param(
  [string]$MirrorRepoPath = "",
  [switch]$CheckRemoteMigrations,
  [string]$SupabaseExe = "supabase"
)

$ErrorActionPreference = "Stop"

function Add-Issue([System.Collections.Generic.List[string]]$issues, [string]$message) {
  $issues.Add($message) | Out-Null
}

function Compare-FileHashSafe(
  [string]$leftPath,
  [string]$rightPath
) {
  if (-not (Test-Path $leftPath) -or -not (Test-Path $rightPath)) {
    return $null
  }
  $leftHash = (Get-FileHash $leftPath -Algorithm SHA256).Hash
  $rightHash = (Get-FileHash $rightPath -Algorithm SHA256).Hash
  return $leftHash -eq $rightHash
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$issues = New-Object 'System.Collections.Generic.List[string]'

Write-Host "==> Sync guard: $repoRoot" -ForegroundColor Cyan

$requiredFiles = @(
  "src/hooks/useChat.tsx",
  "src/hooks/useChannels.tsx",
  "src/hooks/useGroupChats.tsx",
  "src/components/chat/ChatConversation.tsx",
  "src/components/chat/ChannelConversation.tsx",
  "src/components/chat/GroupConversation.tsx",
  "supabase/migrations/20260222239000_channel_settings_telegram_like_v1.sql",
  "supabase/migrations/20260223090000_channel_posts_notify_and_media_v1.sql",
  "supabase/migrations/20260224005000_pinned_messages_telegram_like.sql"
)

foreach ($rel in $requiredFiles) {
  $abs = Join-Path $repoRoot $rel
  if (-not (Test-Path $abs)) {
    Add-Issue $issues "Missing required file: $rel"
  }
}

 $useChatPath = Join-Path $repoRoot "src/hooks/useChat.tsx"
 if (Test-Path $useChatPath) {
   $useChatRaw = [System.IO.File]::ReadAllText($useChatPath, [Text.UTF8Encoding]::new($false))
   $hash = (Get-FileHash $useChatPath -Algorithm SHA256).Hash
   Write-Host "[sync-guard] useChat.tsx hash: $hash" -ForegroundColor Yellow
   Write-Host "[sync-guard] First 200 chars:" -ForegroundColor Yellow
   Write-Host ($useChatRaw.Substring(0, [Math]::Min(200, $useChatRaw.Length)))
   $contains = $useChatRaw.Contains('falling back to legacy')
   $idx = $useChatRaw.IndexOf('falling back to legacy', [StringComparison]::Ordinal)
   Write-Host "[sync-guard] Contains: $contains, IndexOf: $idx" -ForegroundColor Yellow
   if (-not $contains) {
     Add-Issue $issues "useChat.tsx: no legacy fallback marker found. DM writes may hard-fail on v11 rejects."
   }
   if ($useChatRaw -notmatch 'ackStatus === "accepted" \|\| ackStatus === "duplicate"') {
     Add-Issue $issues "useChat.tsx: expected ack-status acceptance gate not found."
   }
 }

if (-not [string]::IsNullOrWhiteSpace($MirrorRepoPath)) {
  $mirror = $MirrorRepoPath.Trim()
  if (-not (Test-Path $mirror)) {
    Add-Issue $issues "Mirror path does not exist: $mirror"
  } else {
    Write-Host "==> Mirror drift check: $mirror" -ForegroundColor Cyan
    $keyFiles = @(
      "src/hooks/useChat.tsx",
      "src/hooks/useChannels.tsx",
      "src/hooks/useGroupChats.tsx",
      "src/components/chat/ChatConversation.tsx",
      "src/components/chat/ChannelConversation.tsx",
      "src/components/chat/GroupConversation.tsx",
      "supabase/migrations/20260222239000_channel_settings_telegram_like_v1.sql",
      "supabase/migrations/20260223090000_channel_posts_notify_and_media_v1.sql",
      "supabase/migrations/20260224005000_pinned_messages_telegram_like.sql"
    )

    foreach ($rel in $keyFiles) {
      $left = Join-Path $repoRoot $rel
      $right = Join-Path $mirror $rel
      if (-not (Test-Path $left)) {
        Add-Issue $issues "Key file missing in source repo: $rel"
        continue
      }
      if (-not (Test-Path $right)) {
        Add-Issue $issues "Key file missing in mirror repo: $rel"
        continue
      }
      $equal = Compare-FileHashSafe -leftPath $left -rightPath $right
      if ($equal -eq $false) {
        Add-Issue $issues "Mirror drift for $rel"
      }
    }
  }
}

if ($CheckRemoteMigrations) {
  Write-Host "==> Remote migration drift check" -ForegroundColor Cyan
  $exe = $SupabaseExe.Trim()
  $oldEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    if ($exe -eq "npx supabase") {
      $raw = & npx supabase migration list 2>&1
    } elseif ($exe -eq "npx") {
      $raw = & npx supabase migration list 2>&1
    } else {
      $raw = & $SupabaseExe migration list 2>&1
    }
  } finally {
    $ErrorActionPreference = $oldEap
  }
  if ($LASTEXITCODE -ne 0) {
    Add-Issue $issues "Unable to read remote migrations. Supabase CLI exit code: $LASTEXITCODE"
  }
  $lines = @($raw)

  foreach ($line in $lines) {
    $s = [string]$line
    if ($s -match '^\s*Local\s+\|\s+Remote\s+\|') { continue }
    if ($s -match '^\s*-+\|-+\|') { continue }

    $m = [regex]::Match($s, '^\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*$')
    if (-not $m.Success) { continue }

    $local = $m.Groups[1].Value.Trim()
    $remote = $m.Groups[2].Value.Trim()
    if ([string]::IsNullOrWhiteSpace($local) -and [string]::IsNullOrWhiteSpace($remote)) { continue }

    if ([string]::IsNullOrWhiteSpace($local) -xor [string]::IsNullOrWhiteSpace($remote)) {
      Add-Issue $issues "Migration drift row: local='$local' remote='$remote'"
    }
  }
}


Write-Host ""
Write-Host "Sync guard diagnostics:" -ForegroundColor Cyan
Write-Host "Issues count: $($issues.Count)"
if ($issues.Count -gt 0) {
  Write-Host "Sync guard failed:" -ForegroundColor Red
  foreach ($i in $issues) {
    Write-Host " - $i" -ForegroundColor Red
  }
  exit 1
} else {
  Write-Host "Sync guard passed." -ForegroundColor Green
  exit 0
}

Write-Host "Sync guard passed." -ForegroundColor Green
