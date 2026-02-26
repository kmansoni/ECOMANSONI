#!/usr/bin/env pwsh
# Проверка логов установки

param(
    [string]$Server = "5.42.99.76",
    [string]$User = "root",
    [string]$Password = "pzLgTT9Dn^XVQ8"
)

Import-Module Posh-SSH -ErrorAction Stop

Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║        Проверка статуса и логов установки                ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

$secPassword = ConvertTo-SecureString $Password -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential($User, $secPassword)
$session = New-SSHSession -ComputerName $Server -Credential $cred -AcceptKey -ErrorAction Stop

# Проверяем процесс
Write-Host "→ Процесс установки:" -ForegroundColor Yellow
$procResult = Invoke-SSHCommand -SSHSession $session -Command "ps aux | grep -E 'setup|postgre|npm' | grep -v grep | head -10"
if ($procResult.Output) {
    Write-Host $procResult.Output -ForegroundColor Gray
} else {
    Write-Host "  Процесс завершен или не найден" -ForegroundColor Gray
}

# Проверяем последние логи
Write-Host "`n→ Последние логи системы:" -ForegroundColor Yellow
$logResult = Invoke-SSHCommand -SSHSession $session -Command "tail -30 /var/log/syslog | tail -15"
Write-Host $logResult.Output -ForegroundColor Gray

# Проверяем наличие конфигов
Write-Host "`n→ Проверяю наличие конфигурационных файлов:" -ForegroundColor Yellow
$files = @(
    "/etc/postgrest/mansoni.conf",
    "/etc/turnserver.conf",
    "/opt/mansoni-turn-api/server.js",
    "/etc/nginx/sites-available/mansoni-api"
)

foreach ($file in $files) {
    $fileResult = Invoke-SSHCommand -SSHSession $session -Command "[ -f $file ] && echo 'exists' || echo 'missing'"
    if ($fileResult.Output.Trim() -eq "exists") {
        Write-Host "  ✓ $file" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $file" -ForegroundColor Red
    }
}

# Проверяем БД
Write-Host "`n→ Статус PostgreSQL:" -ForegroundColor Yellow
$pgResult = Invoke-SSHCommand -SSHSession $session -Command "systemctl status postgresql --no-pager | head -10"
Write-Host $pgResult.Output -ForegroundColor Gray

# Проверяем journalctl
Write-Host "`n→ Ошибки в journalctl:" -ForegroundColor Yellow
$journalResult = Invoke-SSHCommand -SSHSession $session -Command "journalctl -n 30 --no-pager | grep -i error | tail -5"
if ($journalResult.Output) {
    Write-Host $journalResult.Output -ForegroundColor Yellow
} else {
    Write-Host "  Ошибок не найдено" -ForegroundColor Green
}

Remove-SSHSession -SSHSession $session | Out-Null

Write-Host "`n→ Следующий шаг:" -ForegroundColor Cyan
Write-Host "  Start-Sleep -Seconds 120" -ForegroundColor Yellow
Write-Host "  & '.\scripts\timeweb-get-config.ps1'" -ForegroundColor Yellow
