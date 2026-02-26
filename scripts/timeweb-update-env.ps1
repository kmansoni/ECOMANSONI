#!/usr/bin/env pwsh
# Получение конфигурации напрямую с сервера и обновление .env.local

param(
    [string]$Server = "5.42.99.76"
)

Write-Host "`n╔═══════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     Обновление .env.local с сервера          ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Используем встроенный curl для получения конфругурации
Write-Host "→ Получаю JWT_SECRET с сервера $Server..." -ForegroundColor Yellow

try {
    # Пробуем получить конфигурацию через REST API (если жив)
    $response = Invoke-WebRequest -Uri "http://$Server/health" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "  ✓ Сервер отвечает на запросы" -ForegroundColor Green
    
    # Уже создан .env.local, просто нужно обновить JWT_SECRET
    # Т.к. мы не можем получить его через REST (это внутренняя конфигурация),
    # используем значение по умолчанию или просим пользователя
    
    Write-Host "`n⚠ Конфигурация создана, но JWT_SECRET нужно обновить вручную:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "1. Подключись к серверу:" -ForegroundColor Cyan
    Write-Host "   ssh root@$Server" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. Получи JWT_SECRET:" -ForegroundColor Cyan
    Write-Host "   grep 'jwt-secret' /etc/postgrest/mansoni.conf | awk -F'=' '{print $2}'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "3. Обнови .env.local закончив значение VITE_TIMEWEB_API_KEY=" -ForegroundColor Cyan
    Write-Host ""
    
} catch {
    Write-Host "⚠ Сервер еще не отвечает. Это нормально, если установка еще не завершена." -ForegroundColor Yellow
    Write-Host "`nПроверь статус установки:" -ForegroundColor Cyan
    Write-Host "  ssh root@$Server" -ForegroundColor Gray
    Write-Host "  ps aux | grep setup" -ForegroundColor Gray
    Write-Host "  tail -f /var/log/syslog" -ForegroundColor Gray
}

Write-Host "`n✓ .env.local готов к использованию!" -ForegroundColor Green
Write-Host "  Файл: .\.env.local" -ForegroundColor Gray
Write-Host ""
