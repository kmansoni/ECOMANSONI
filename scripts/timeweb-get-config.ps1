#!/usr/bin/env pwsh
# Получение конфигурации для .env.local после установки

param(
    [string]$Server = "5.42.99.76",
    [string]$User = "root",
    [string]$Password = "pzLgTT9Dn^XVQ8"
)

Import-Module Posh-SSH -ErrorAction Stop

Write-Host "`n╔═══════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       Получение конфигурации Timeweb         ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

function Invoke-SSH {
    param([string]$Command)
    try {
        $secPassword = ConvertTo-SecureString $Password -AsPlainText -Force
        $cred = New-Object System.Management.Automation.PSCredential($User, $secPassword)
        $session = New-SSHSession -ComputerName $Server -Credential $cred -AcceptKey -ErrorAction Stop -ConnectionTimeout 30
        $result = Invoke-SSHCommand -SSHSession $session -Command $Command -TimeOut 60
        Remove-SSHSession -SSHSession $session | Out-Null
        return $result.Output, $result.ExitStatus
    } catch {
        Write-Error "SSH ошибка: $_"
        return $null, 1
    }
}

# Получаем JWT_SECRET
Write-Host "→ Получаю JWT_SECRET..." -ForegroundColor Yellow
$jwtOutput, $exitCode = Invoke-SSH "cat /etc/postgrest/mansoni.conf | grep 'jwt-secret' | awk -F'=' '{print $2}' | xargs"
if ($exitCode -eq 0 -and $jwtOutput) {
    $jwtSecret = $jwtOutput.Trim() -replace '"', ''
    Write-Host "  ✓ JWT_SECRET: $($jwtSecret.Substring(0, 20))..." -ForegroundColor Green
} else {
    Write-Host "  ✗ Не удалось получить JWT_SECRET" -ForegroundColor Red
    $jwtSecret = ""
}

# Получаем пароль БД из переменной окружения (если доступна)
Write-Host "`n→ Получаю пароль БД..." -ForegroundColor Yellow
$dbPwdOutput, $_ = Invoke-SSH "cat /root/install.sh 2>/dev/null | grep DB_PASSWORD | head -1 | grep -o \"'[^']*'\" | sed \"s/'//g\""
if ($dbPwdOutput) {
    $dbPassword = $dbPwdOutput.Trim()
    Write-Host "  ✓ Пароль БД найден" -ForegroundColor Green
} else {
    Write-Host "  ⚠ Пароль БД не может быть восстановлен" -ForegroundColor Yellow
    $dbPassword = "mansoni_password_12345"
}

# Создаем .env.local
Write-Host "`n→ Создаю .env.local..." -ForegroundColor Yellow

$envContent = @"
# ==============================================================================
# TIMEWEB BACKEND CONFIGURATION
# Автоматически сгенерировано: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
# ==============================================================================

# Supabase (только для auth и storage)
VITE_SUPABASE_URL=https://lfkbgnbjxskspsownvjm.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxma2JnbmJqeHNrc3Bzb3dudmptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0NDI0NTYsImV4cCI6MjA4NzAxODQ1Nn0.WNubMc1s9TA91aT_txY850x2rWJ1ayxiTs7Rq6Do21k

# Timeweb Backend (все остальные таблицы)
VITE_TIMEWEB_API_URL=http://$Server
VITE_TIMEWEB_API_KEY=$jwtSecret

# TURN Server
VITE_TURN_CREDENTIALS_URL=http://$Server/turn-credentials

"@

if (Test-Path ".\.env.local") {
    Write-Host "  ⚠ Файл .env.local уже существует - создаю резервную копию" -ForegroundColor Yellow
    Copy-Item ".\.env.local" ".\.env.local.backup"
}

Set-Content -Path ".\.env.local" -Value $envContent -Encoding UTF8
Write-Host "  ✓ Файл .env.local создан" -ForegroundColor Green

# Проверяем конфигурацию
Write-Host "`n╔═══════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║            Конфигурация готова! 🎉            ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

Write-Host "API URL:    http://$Server" -ForegroundColor White
Write-Host "JWT Secret: $($jwtSecret.Substring(0, 32) + '...')" -ForegroundColor White
Write-Host "DB Password: $($dbPassword)" -ForegroundColor White
Write-Host ""

# Проверяем сервисы
Write-Host "→ Проверяю сервисы..." -ForegroundColor Yellow
$services = @("postgresql", "postgrest-mansoni", "coturn", "mansoni-turn-api", "nginx")
$allOk = $true

foreach ($svc in $services) {
    $status, $_ = Invoke-SSH "systemctl is-active $svc 2>/dev/null || echo 'inactive'"
    if ($status.Trim() -eq "active") {
        Write-Host "  ✓ $svc" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $svc - не запущен" -ForegroundColor Red
        $allOk = $false
    }
}

if ($allOk) {
    Write-Host "`n✓ ВСЕ ГОТОВО! Можно запускать frontend 🚀" -ForegroundColor Green
    Write-Host "`nСледующие шаги:" -ForegroundColor Yellow
    Write-Host "  1. npm run dev" -ForegroundColor Cyan
    Write-Host "  2. Открой http://localhost:5173" -ForegroundColor Cyan
} else {
    Write-Host "`n⚠ Некоторые сервисы не запущены. Подожди еще 2-3 минуты" -ForegroundColor Yellow
}

Write-Host ""
