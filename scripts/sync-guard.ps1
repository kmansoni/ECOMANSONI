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

function Resolve-ProjectRefFromRepo([string]$repoRootPath) {
  $linkedRefPath = Join-Path $repoRootPath 'supabase\.temp\project-ref'
  if (Test-Path -LiteralPath $linkedRefPath) {
    $linked = (Get-Content -LiteralPath $linkedRefPath -Raw -Encoding UTF8).Trim()
    if (-not [string]::IsNullOrWhiteSpace($linked)) {
      return $linked
    }
  }

  $configPath = Join-Path $repoRootPath 'supabase\config.toml'
  if (Test-Path -LiteralPath $configPath) {
    $line = Get-Content -LiteralPath $configPath | Where-Object { $_ -match '^\s*project_id\s*=\s*"([a-z0-9-]+)"\s*$' } | Select-Object -First 1
    if (-not [string]::IsNullOrWhiteSpace($line)) {
      $m = [regex]::Match($line, '^\s*project_id\s*=\s*"([a-z0-9-]+)"\s*$')
      if ($m.Success) {
        return $m.Groups[1].Value
      }
    }
  }

  return ''
}

function Get-RemoteMigrationStateViaApi([string]$repoRootPath) {
  $token = $env:SUPABASE_ACCESS_TOKEN
  if ([string]::IsNullOrWhiteSpace($token)) {
    $token = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'User')
  }
  if ([string]::IsNullOrWhiteSpace($token)) {
    $token = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'Machine')
  }
  if ([string]::IsNullOrWhiteSpace($token)) {
    return @{ ok = $false; message = 'Management API fallback unavailable: SUPABASE_ACCESS_TOKEN is missing.' }
  }

  $projectRef = Resolve-ProjectRefFromRepo -repoRootPath $repoRootPath
  if ([string]::IsNullOrWhiteSpace($projectRef)) {
    return @{ ok = $false; message = 'Management API fallback unavailable: project ref is missing.' }
  }

  $migrationsDir = Join-Path $repoRootPath 'supabase\migrations'
  if (-not (Test-Path -LiteralPath $migrationsDir)) {
    return @{ ok = $false; message = 'Management API fallback unavailable: local migrations directory not found.' }
  }

  try {
    $api = "https://api.supabase.com/v1/projects/$projectRef/database/query"
    $headers = @{
      Authorization = "Bearer $token"
      apikey = $token
      'Content-Type' = 'application/json'
    }

    $body = @{ query = 'select version from supabase_migrations.schema_migrations order by version;' } | ConvertTo-Json -Compress
    $resp = Invoke-WebRequest -Uri $api -Method Post -Headers $headers -Body $body -ErrorAction Stop
    $rows = $resp.Content | ConvertFrom-Json

    $remoteVersions = New-Object 'System.Collections.Generic.HashSet[string]'
    foreach ($row in @($rows)) {
      if ($null -ne $row.version) {
        [void]$remoteVersions.Add([string]$row.version)
      }
    }

    $localVersions = New-Object 'System.Collections.Generic.HashSet[string]'
    Get-ChildItem -LiteralPath $migrationsDir -Filter '*.sql' -File | Sort-Object Name | ForEach-Object {
      $m = [regex]::Match($_.Name, '^(\d+)_')
      if ($m.Success) {
        [void]$localVersions.Add($m.Groups[1].Value)
      }
    }

    $missingRemote = New-Object System.Collections.Generic.List[string]
    foreach ($version in $localVersions) {
      if (-not $remoteVersions.Contains($version)) {
        $missingRemote.Add($version) | Out-Null
      }
    }

    $remoteOnly = New-Object System.Collections.Generic.List[string]
    foreach ($version in $remoteVersions) {
      if (-not $localVersions.Contains($version)) {
        $remoteOnly.Add($version) | Out-Null
      }
    }

    return @{
      ok = $true
      projectRef = $projectRef
      missingRemote = @($missingRemote)
      remoteOnly = @($remoteOnly)
    }
  } catch {
    return @{ ok = $false; message = "Management API fallback failed: $($_.Exception.Message)" }
  }
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
  $dbPassword = $env:SUPABASE_DB_PASSWORD
  if ([string]::IsNullOrWhiteSpace($dbPassword)) {
    $dbPassword = $env:PGPASSWORD
  }
  $usedApiFallback = $false
  $lines = @()
  if (-not [string]::IsNullOrWhiteSpace($dbPassword)) {
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
    $lines = @($raw)
  }

  $rawText = ($lines | ForEach-Object { [string]$_ }) -join "`n"
  $cliNeedsFallback = [string]::IsNullOrWhiteSpace($dbPassword) -or $LASTEXITCODE -ne 0

  if ($cliNeedsFallback) {
    if (-not [string]::IsNullOrWhiteSpace($dbPassword) -and $LASTEXITCODE -ne 0) {
      $snippet = (($lines | Select-Object -First 3) | ForEach-Object { [string]$_ }) -join " | "
      Write-Host "Supabase CLI remote migration check failed; trying Management API fallback. Output: $snippet" -ForegroundColor Yellow
    } else {
      Write-Host "Supabase CLI remote migration check unavailable; trying Management API fallback." -ForegroundColor Yellow
    }

    $apiState = Get-RemoteMigrationStateViaApi -repoRootPath $repoRoot
    if (-not $apiState.ok) {
      if ([string]::IsNullOrWhiteSpace($dbPassword) -or $rawText -match 'SUPABASE_DB_PASSWORD|unexpected login role status 401|Connect to your database by setting the env var|password authentication failed|SQLSTATE 28P01|failed SASL auth') {
        Add-Issue $issues $apiState.message
      } else {
        $snippet = (($lines | Select-Object -First 3) | ForEach-Object { [string]$_ }) -join " | "
        Add-Issue $issues "Unable to read remote migrations. Supabase CLI exit code: $LASTEXITCODE. Output: $snippet"
        Add-Issue $issues $apiState.message
      }
    } else {
      $usedApiFallback = $true
      Write-Host "Remote migration check passed via Management API fallback for project $($apiState.projectRef)." -ForegroundColor Yellow

      foreach ($version in $apiState.missingRemote) {
        Add-Issue $issues "Migration drift row: local='$version' remote=''"
      }
      foreach ($version in $apiState.remoteOnly) {
        Add-Issue $issues "Migration drift row: local='' remote='$version'"
      }
    }
  }

  if (-not $usedApiFallback -and $LASTEXITCODE -eq 0) {
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
