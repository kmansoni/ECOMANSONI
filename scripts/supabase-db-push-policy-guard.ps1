param(
  [string]$RepoRoot = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$violations = New-Object System.Collections.Generic.List[string]

function Add-Violation([string]$path, [int]$line, [string]$text) {
  $violations.Add("${path}:${line} :: $text")
}

# Rule 1: no direct db push execution in PowerShell scripts.
$scriptFiles = Get-ChildItem -LiteralPath (Join-Path $RepoRoot "scripts") -Recurse -Filter "*.ps1" -File
foreach ($file in $scriptFiles) {
  if ($file.Name -eq "supabase-db-push-policy-guard.ps1") { continue }

  $lineNo = 0
  Get-Content -LiteralPath $file.FullName | ForEach-Object {
    $lineNo++
    $line = [string]$_

    # Detect executable invocations, not plain docs/log messages.
    $isDirectPush = $line -match '^\s*&\s+.*\bdb\s+push\b' -or $line -match '^\s*supabase(\.exe)?\s+db\s+push\b'
    if ($isDirectPush) {
      $relative = $file.FullName.Substring($RepoRoot.Length + 1)
      Add-Violation $relative $lineNo $line.Trim()
    }
  }
}

# Rule 2: VS Code tasks must not invoke raw `supabase db push`; use wrapper script.
$tasksPath = Join-Path $RepoRoot ".vscode\tasks.json"
if (Test-Path -LiteralPath $tasksPath) {
  try {
    $tasksJson = Get-Content -LiteralPath $tasksPath -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($task in @($tasksJson.tasks)) {
      $command = [string]$task.command
      $args = @($task.args)
      if ([string]::IsNullOrWhiteSpace($command)) { continue }

      $isSupabaseCmd = $command -match 'supabase(\.exe)?$' -or $command -match 'supabase-cli\\'
      $isDbPushArgs = $args.Count -ge 2 -and [string]$args[0] -eq 'db' -and [string]$args[1] -eq 'push'

      if ($isSupabaseCmd -and $isDbPushArgs) {
        Add-Violation ".vscode/tasks.json" 0 ("task '" + [string]$task.label + "' uses raw supabase db push")
      }
    }
  } catch {
    Add-Violation ".vscode/tasks.json" 0 ("failed to parse tasks.json: " + $_.Exception.Message)
  }
}

if ($violations.Count -gt 0) {
  Write-Host "SUPABASE DB PUSH POLICY VIOLATION" -ForegroundColor Red
  Write-Host "Rule: direct 'supabase db push' is forbidden. Use scripts/supabase-db-push.ps1 only." -ForegroundColor Yellow
  Write-Host ""
  foreach ($v in $violations) {
    Write-Host " - $v" -ForegroundColor Red
  }
  exit 1
}

Write-Host "Supabase db push policy guard passed." -ForegroundColor Green
exit 0
