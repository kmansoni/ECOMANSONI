# Загружает все секреты из .secrets/credentials.env в текущую сессию PowerShell
# Использование: . .\scripts\load-secrets.ps1

$secretsFile = Join-Path $PSScriptRoot "..\\.secrets\\credentials.env"

if (-not (Test-Path $secretsFile)) {
    Write-Error "Secrets file not found: $secretsFile"
    Write-Host "Create it from template: cp .secrets/credentials.env.example .secrets/credentials.env" -ForegroundColor Yellow
    exit 1
}

$count = 0
Get-Content $secretsFile | ForEach-Object {
    $line = $_.Trim()
    # Пропускаем комментарии и пустые строки
    if ($line -match '^\s*#' -or [string]::IsNullOrWhiteSpace($line)) { return }
    # Парсим KEY="VALUE" или KEY=VALUE
    if ($line -match '^([A-Z0-9_]+)="?([^"]*)"?$') {
        $key = $Matches[1]
        $val = $Matches[2]
        [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
        Set-Item -Path "Env:$key" -Value $val
        $count++
    }
}

Write-Host "Loaded $count secrets from .secrets/credentials.env" -ForegroundColor Green
