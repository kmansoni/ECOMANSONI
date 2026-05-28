#!/usr/bin/env pwsh
# start-test-browser.ps1
# Запускает Chromium с CDP на порту 9222 и оставляет его открытым.
# Повторный запуск просто сообщает об уже открытом браузере.

param(
  [int]$Port = 9222,
  [string]$BaseUrl = "http://127.0.0.1:8092"
)

$cdpUrl = "http://127.0.0.1:$Port/json/version"
$alreadyRunning = try {
  $r = Invoke-RestMethod -Uri $cdpUrl -TimeoutSec 2 -ErrorAction Stop
  Write-Host "Browser already running: $($r.Browser)"
  $true
} catch { $false }

if ($alreadyRunning) { exit 0 }

$chromiumPath = "$env:LOCALAPPDATA\ms-playwright\chromium-*\chrome-win64\chrome.exe"
$resolved = (Resolve-Path $chromiumPath -ErrorAction SilentlyContinue | Select-Object -Last 1).Path

if (-not $resolved) {
  Write-Error "Chromium not found. Run: npx playwright install chromium"
  exit 1
}

$profileDir = "$env:TEMP\playwright-sfu-profile"
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

$args = @(
  "--remote-debugging-port=$Port"
  "--remote-allow-origins=*"
  "--use-fake-device-for-media-stream"
  "--use-fake-ui-for-media-stream"
  "--allow-file-access"
  "--no-first-run"
  "--no-default-browser-check"
  "--disable-background-networking"
  "--disable-sync"
  "--no-sandbox"
  "--user-data-dir=$profileDir"
  $BaseUrl
)

Write-Host "Starting Chromium on CDP port $Port..."
Start-Process -FilePath $resolved -ArgumentList $args -WindowStyle Normal

# Wait for CDP to become available
$ready = $false
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    Invoke-RestMethod -Uri $cdpUrl -TimeoutSec 1 -ErrorAction Stop | Out-Null
    $ready = $true
    break
  } catch {}
}

if ($ready) {
  Write-Host "Browser ready at $cdpUrl"
} else {
  Write-Error "Browser did not become ready within 10s"
  exit 1
}
