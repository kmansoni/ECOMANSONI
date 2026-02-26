#!/usr/bin/env pwsh
# Инициализация переменных окружения для Timeweb сервера

# Сгенерированный пароль БД из установки
$env:DB_PASSWORD = "PmkvlEnBRrIdS4MCbV56"
$env:DB_USER = "mansoni_app"
$env:DB_NAME = "mansoni"
$env:SERVER_IP = "5.42.99.76"
$env:TURN_SECRET = "7c0fa2d30f7a20fb54bceb89dc3984553a2ef5226b5a66f45ae64db74fcc1d00"

Write-Host "╔════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║      Переменные окружения установлены                 ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "✓ DB_PASSWORD = $env:DB_PASSWORD" -ForegroundColor Green
Write-Host "✓ DB_USER = $env:DB_USER" -ForegroundColor Green
Write-Host "✓ DB_NAME = $env:DB_NAME" -ForegroundColor Green
Write-Host "✓ SERVER_IP = $env:SERVER_IP" -ForegroundColor Green
Write-Host "✓ TURN_SECRET = $($env:TURN_SECRET.Substring(0, 16))..." -ForegroundColor Green
Write-Host ""

# Теперь получаем JWT_SECRET с сервера
Write-Host "→ Получаю JWT_SECRET с сервера..." -ForegroundColor Yellow

try {
    Import-Module Posh-SSH -ErrorAction Stop
    
    $secPassword = ConvertTo-SecureString $env:DB_PASSWORD -AsPlainText -Force
    $cred = New-Object System.Management.Automation.PSCredential("root", $secPassword)
    $session = New-SSHSession -ComputerName $env:SERVER_IP -Credential $cred -AcceptKey -ErrorAction Stop -ConnectionTimeout 10
    
    $result = Invoke-SSHCommand -SSHSession $session -Command "grep 'jwt-secret =' /etc/postgrest/mansoni.conf | awk -F'=' '{print `$2}'" -TimeOut 30
    Remove-SSHSession -SSHSession $session | Out-Null
    
    if ($result.Output) {
        $env:JWT_SECRET = $result.Output.Trim() -replace '"', '' -replace ' ', ''
        Write-Host "✓ JWT_SECRET = $($env:JWT_SECRET.Substring(0, 20))..." -ForegroundColor Green
    } else {
        Write-Host "✗ JWT_SECRET не найден на сервере" -ForegroundColor Yellow
        Write-Host "  Проверь: ssh root@$($env:SERVER_IP) \"grep jwt-secret /etc/postgrest/mansoni.conf\"" -ForegroundColor Gray
    }
} catch {
    Write-Host "⚠ Не удалось подключиться к серверу: $_" -ForegroundColor Yellow
    Write-Host "  Может быть, установка еще не завершена. Подожди еще 5 минут." -ForegroundColor Gray
}

Write-Host ""
Write-Host "Переменные окружения готовы к использованию в этом сеансе!" -ForegroundColor Cyan
Write-Host ""
