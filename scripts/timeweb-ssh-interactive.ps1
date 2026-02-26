#!/usr/bin/env pwsh
# Прямое подключение к серверу для отладки

param(
    [string]$Server = "5.42.99.76",
    [string]$User = "root",
    [string]$Password = "pzLgTT9Dn^XVQ8"
)

Import-Module Posh-SSH -ErrorAction Stop

Write-Host "Подключаюсь к $Server..." -ForegroundColor Yellow

$secPassword = ConvertTo-SecureString $Password -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential($User, $secPassword)

try {
    $session = New-SSHSession -ComputerName $Server -Credential $cred -AcceptKey
    
    Write-Host "`n═══════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "Вы подключены к $Server"  -ForegroundColor Green
    Write-Host "Выполни команды:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "ps aux | grep setup              # Процессы" -ForegroundColor Gray
    Write-Host "tail -50 /var/log/apt/term.log  # Логи apt" -ForegroundColor Gray
    Write-Host "journalctl -f                    # Журнал системы в реальном времени" -ForegroundColor Gray
    Write-Host "exit                             # Завершить сеанс" -ForegroundColor Gray
    Write-Host "═══════════════════════════════════════════════════════`n" -ForegroundColor Cyan
    
    # Интерактивная оболочка
    while ($true) {
        $command = Read-Host "root@$Server"
        if ($command -eq "exit") { break }
        if ([string]::IsNullOrWhiteSpace($command)) { continue }
        
        $result = Invoke-SSHCommand -SSHSession $session -Command $command -TimeOut 60
        Write-Host $result.Output
        if ($result.Error) {
            Write-Host $result.Error -ForegroundColor Red
        }
    }
    
    Remove-SSHSession -SSHSession $session | Out-Null
    Write-Host "Сеанс закрыт" -ForegroundColor Green
    
} catch {
    Write-Host "Ошибка подключения: $_" -ForegroundColor Red
}
