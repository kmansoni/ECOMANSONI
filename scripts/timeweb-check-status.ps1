#!/usr/bin/env pwsh
# Проверка статуса установки на Timeweb сервере

param(
    [string]$Server = "5.42.99.76",
    [string]$User = "root",
    [string]$Password = "pzLgTT9Dn^XVQ8"
)

Import-Module Posh-SSH -ErrorAction Stop

Write-Host "`n╔═══════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Проверка статуса установки на сервере $Server  ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

function Invoke-SSH {
    param([string]$Command)
    $secPassword = ConvertTo-SecureString $Password -AsPlainText -Force
    $cred = New-Object System.Management.Automation.PSCredential($User, $secPassword)
    $session = New-SSHSession -ComputerName $Server -Credential $cred -AcceptKey -ErrorAction Stop
    $result = Invoke-SSHCommand -SSHSession $session -Command $Command -TimeOut 30
    Remove-SSHSession -SSHSession $session | Out-Null
    return $result.Output
}

# Проверяем процесс установки
Write-Host "→ Проверяем процесс установки..." -ForegroundColor Yellow
$installProc = Invoke-SSH "ps aux | grep timeweb-full-setup.sh | grep -v grep"
if ($installProc) {
    Write-Host "  ⏳ Установка все еще выполняется" -ForegroundColor Yellow
    Write-Host "  Подожди 2-3 минуты и запусти скрипт снова" -ForegroundColor Cyan
    Write-Host "`n  Или отслеживай процесс:" -ForegroundColor Gray
    Write-Host "  ssh root@$Server" -ForegroundColor Gray
    Write-Host "  tail -f /var/log/syslog" -ForegroundColor Gray
    exit 0
} else {
    Write-Host "  ✓ Процесс установки завершен" -ForegroundColor Green
}

# Проверяем сервисы
Write-Host "`n→ Проверяем сервисы..." -ForegroundColor Yellow
$services = @("postgresql", "postgrest-mansoni", "coturn", "mansoni-turn-api", "nginx")

$allOk = $true
foreach ($svc in $services) {
    $status = Invoke-SSH "systemctl is-active $svc 2>/dev/null || echo 'inactive'"
    if ($status -eq "active") {
        Write-Host "  ✓ $svc" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $svc - не запущен" -ForegroundColor Red
        $allOk = $false
    }
}

if ($allOk) {
    Write-Host "`n✓ Все сервисы работают!" -ForegroundColor Green
    Write-Host "Теперь можно запустить: .\scripts\timeweb-get-config.ps1" -ForegroundColor Cyan
} else {
    Write-Host "`n⚠ Некоторые сервисы не запущены" -ForegroundColor Yellow
    Write-Host "Проверь логи: ssh root@$Server 'journalctl -xe'" -ForegroundColor Cyan
}
