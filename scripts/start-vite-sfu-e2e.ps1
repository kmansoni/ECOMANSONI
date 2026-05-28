#!/usr/bin/env pwsh
# start-vite-sfu-e2e.ps1
# Запускает Vite на порту 8093 с VITE_CALLS_REQUIRE_SFRAME=false для SFU E2E тестов.
# Основной dev-сервер на 8092 не трогается.

param(
  [int]$Port = 8093
)

# Check if already running
$already = try {
  $r = Invoke-RestMethod -Uri "http://127.0.0.1:$Port" -TimeoutSec 1 -ErrorAction Stop
  $true
} catch {
  $false
}

if ($already) {
  Write-Host "Vite E2E server already running on port $Port"
  exit 0
}

Write-Host "Starting Vite E2E server on port $Port with REQUIRE_SFRAME=false..."

$env:VITE_CALLS_REQUIRE_SFRAME = "false"
$env:VITE_CALLS_FRAME_E2EE_ADVERTISE_SFRAME = "false"

# Start Vite in background (async) with mode e2e (loads .env + .env.e2e, .env.e2e overrides .env)
$proc = Start-Process -FilePath "npx" `
  -ArgumentList "vite", "--host", "127.0.0.1", "--port", "$Port", "--mode", "e2e" `
  -WorkingDirectory (Get-Location) `
  -WindowStyle Minimized `
  -PassThru

Write-Host "Vite PID: $($proc.Id)"

# Wait for server to be ready
$ready = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    $null = Invoke-WebRequest -Uri "http://127.0.0.1:$Port" -TimeoutSec 1 -ErrorAction Stop
    $ready = $true
    break
  } catch {}
}

if ($ready) {
  Write-Host "Vite E2E server ready at http://127.0.0.1:$Port"
} else {
  Write-Error "Vite E2E server did not start within 20s"
  exit 1
}
