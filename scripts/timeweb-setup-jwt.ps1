#!/usr/bin/env pwsh
# Получение JWT_SECRET со скрипта установки и обновление .env.local

param(
    [string]$Server = "5.42.99.76",
    [string]$DbPassword = "PmkvlEnBRrIdS4MCbV56"
)

Write-Host "`n╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║        Получение и установка JWT_SECRET               ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

Write-Host "→ Получаю JWT_SECRET с сервера $Server..." -ForegroundColor Yellow
Write-Host "  (используя пароль: $DbPassword)" -ForegroundColor Gray

# Попытка 1: используем встроенный ssh.exe (если доступен)
try {
    Write-Host "`n  Попытка 1: ssh.exe (Windows native)..." -ForegroundColor Gray
    $output = ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 root@$Server 'grep "jwt-secret =" /etc/postgrest/mansoni.conf | cut -d"=" -f2 | xargs' 2>&1
    if ($output -and $output -notmatch "Permission denied" -and $output -notmatch "password:") {
        $jwtSecret = $output.Trim()
        if ($jwtSecret -and $jwtSecret.Length -gt 10) {
            Write-Host "  ✓ JWT_SECRET получен" -ForegroundColor Green
            goto UpdateEnv
        }
    }
} catch {}

# Попытка 2: используем Posh-SSH если доступен
try {
    Write-Host "  Попытка 2: Posh-SSH модуль..." -ForegroundColor Gray
    if (-not (Get-Module -ListAvailable -Name Posh-SSH)) {
        Write-Host "    Установка Posh-SSH..." -ForegroundColor Gray
        Install-Module -Name Posh-SSH -Force -Scope CurrentUser -SkipPublisherCheck -AllowClobber -ErrorAction Stop
    }
    
    Import-Module Posh-SSH
    $secPassword = ConvertTo-SecureString $DbPassword -AsPlainText -Force
    $cred = New-Object System.Management.Automation.PSCredential("root", $secPassword)
    
    $session = New-SSHSession -ComputerName $Server -Credential $cred -AcceptKey -ErrorAction Stop -ConnectionTimeout 10
    $result = Invoke-SSHCommand -SSHSession $session -Command 'grep "jwt-secret =" /etc/postgrest/mansoni.conf | cut -d"=" -f2 | xargs' -TimeOut 30
    Remove-SSHSession -SSHSession $session | Out-Null
    
    if ($result.Output) {
        $jwtSecret = $result.Output.Trim()
        if ($jwtSecret -and $jwtSecret.Length -gt 10) {
            Write-Host "  ✓ JWT_SECRET получен" -ForegroundColor Green
            goto UpdateEnv
        }
    }
} catch {
    Write-Host "    Ошибка: $_" -ForegroundColor Gray
}

# Если все попытки не сработали
Write-Host "`n  ✗ Автоматически не удалось получить JWT_SECRET" -ForegroundColor Yellow
Write-Host "`n  Получи вручную:" -ForegroundColor Cyan
Write-Host "    ssh root@$Server" -ForegroundColor Gray
Write-Host "    grep 'jwt-secret =' /etc/postgrest/mansoni.conf | cut -d'=' -f2" -ForegroundColor Gray
exit 1

:UpdateEnv

# Обновляем .env.local
Write-Host "`n→ Обновляю .env.local..." -ForegroundColor Yellow

$envFile = ".\.env.local"
if (Test-Path $envFile) {
    $content = Get-Content $envFile -Raw
    $content = $content -replace 'VITE_TIMEWEB_API_KEY=.*', "VITE_TIMEWEB_API_KEY=$jwtSecret"
    Set-Content -Path $envFile -Value $content -Encoding UTF8
    Write-Host "✓ .env.local обновлен с JWT_SECRET" -ForegroundColor Green
} else {
    Write-Host "✗ Файл .env.local не найден" -ForegroundColor Red
    exit 1
}

# Выводим итоги
Write-Host "`n╔════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║           JWT_SECRET УСТАНОВЛЕН ✓                     ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════╝`n" -ForegroundColor Green

Write-Host ".env.local готов к использованию!" -ForegroundColor Cyan
Write-Host "VITE_TIMEWEB_API_KEY=$($jwtSecret.Substring(0, 20))..." -ForegroundColor Gray
Write-Host ""
Write-Host "Можешь запустить frontend:" -ForegroundColor Yellow
Write-Host "  npm run dev" -ForegroundColor Cyan
Write-Host ""
