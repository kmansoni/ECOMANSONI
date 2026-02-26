#!/usr/bin/env pwsh
# Привязка домена mansoni.ru к Timeweb серверу

param(
    [string]$Domain = "mansoni.ru",
    [string]$Server = "5.42.99.76",
    [string]$RootPassword = "pzLgTT9Dn^XVQ8"
)

Write-Host "`n╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║      Привязка домена $Domain к Timeweb       ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

Write-Host "📋 План действий:`n" -ForegroundColor Yellow
Write-Host "1. Настроить DNS (А запись): $Domain → $Server" -ForegroundColor Gray
Write-Host "2. Установить SSL сертификат (Let's Encrypt)" -ForegroundColor Gray
Write-Host "3. Обновить Nginx конфигурацию" -ForegroundColor Gray
Write-Host "4. Обновить .env.local с новым доменом`n" -ForegroundColor Gray

# ============================================================================
# ШАГ 1: Информация о DNS
# ============================================================================

Write-Host "╔═ ШАГ 1: НАСТРОЙКА DNS ════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                                                           ║" -ForegroundColor Cyan
Write-Host "║ Нужно добавить DNS запись у регистратора:              ║" -ForegroundColor Cyan
Write-Host "║                                                           ║" -ForegroundColor Cyan
Write-Host "║ Тип:  A Record                                          ║" -ForegroundColor Cyan
Write-Host "║ Имя:  @ (или $Domain)                                   ║" -ForegroundColor Cyan
Write-Host "║ IP:   $Server                                     ║" -ForegroundColor Cyan
Write-Host "║ TTL:  3600 (или меньше для быстрого обновления)         ║" -ForegroundColor Cyan
Write-Host "║                                                           ║" -ForegroundColor Cyan
Write-Host "║ ⏰ Это может занять 15 минут - 24 часа                   ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Проверяем текущий DNS
Write-Host "→ Проверяю текущую DNS запись..." -ForegroundColor Yellow
try {
    $dnsResult = Resolve-DnsName -Name $Domain -ErrorAction SilentlyContinue
    if ($dnsResult) {
        Write-Host "  ✓ Домен уже указывает на: $($dnsResult.IPAddress)" -ForegroundColor Green
        if ($dnsResult.IPAddress -eq $Server) {
            Write-Host "  ✓ DNS уже правильно настроена!" -ForegroundColor Green
        } else {
            Write-Host "  ⚠ Домен указывает на другой IP. Обнови DNS запись." -ForegroundColor Yellow
        }
    } else {
        Write-Host "  ⏳ DNS запись еще не распространилась" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ⏳ DNS не найдена (это нормально, может быть не настроена)" -ForegroundColor Yellow
}

Write-Host "`nКогда DNS запись будет установлена, запусти:" -ForegroundColor Cyan
Write-Host "  .\scripts\timeweb-setup-ssl.ps1 -Domain '$Domain'" -ForegroundColor Yellow
Write-Host ""

# ============================================================================
# ШАГ 2: Скрипт для SSL и Nginx (сохраняем для следующего этапа)
# ============================================================================

Write-Host "╔═ ШАГ 2: ПОДГОТОВКА SSL И NGINX ═══════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                                                           ║" -ForegroundColor Cyan
Write-Host "║ Когда DNS будет активна, выполню:                       ║" -ForegroundColor Cyan
Write-Host "║                                                           ║" -ForegroundColor Cyan
Write-Host "║ 1. Установка Certbot (Let's Encrypt)                    ║" -ForegroundColor Cyan
Write-Host "║ 2. Генерация SSL сертификата                             ║" -ForegroundColor Cyan
Write-Host "║ 3. Настройка Nginx для HTTPS                             ║" -ForegroundColor Cyan
Write-Host "║ 4. Редирект HTTP → HTTPS                                 ║" -ForegroundColor Cyan
Write-Host "║ 5. Обновление .env.local                                 ║" -ForegroundColor Cyan
Write-Host "║                                                           ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

Write-Host "✓ Скрипты подготовлены и готовы к использованию!" -ForegroundColor Green
Write-Host ""
