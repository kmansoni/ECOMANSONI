#!/usr/bin/env pwsh
# Автоматическое получение JWT_SECRET и обновление .env.local

param(
    [string]$Server = "5.42.99.76",
    [string]$RootPassword = "pzLgTT9Dn^XVQ8"
)

Write-Host "`n╔═════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Автоматическое получение JWT_SECRET            ║" -ForegroundColor Cyan
Write-Host "╚═════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Попытка 1: Использовать встроенный SSH (без интерактива)
Write-Host "→ Попытка получить JWT_SECRET с сервера..." -ForegroundColor Yellow

# Создаем временный скрипт для получения JWT
$tempScript = [System.IO.Path]::GetTempFileName() + ".sh"
@'
#!/bin/bash
grep "jwt-secret = " /etc/postgrest/mansoni.conf 2>/dev/null | sed 's/.*= "\(.*\)".*/\1/' || echo "NOT_FOUND"
'@ | Set-Content -Path $tempScript -Encoding ASCII

try {
    # Пробуем через SSH напрямую (может работать если ключ уже настроен)
    $output = & ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no root@$Server "grep 'jwt-secret = ' /etc/postgrest/mansoni.conf | sed 's/.*= \"\(.*\)\".*/\1/'" 2>&1 | Select-String -Pattern "^[A-Za-z0-9+/=]{30,}$"
    
    if ($output) {
        $jwtSecret = $output.ToString().Trim()
        Write-Host "✓ JWT_SECRET получен: $($jwtSecret.Substring(0, 20))..." -ForegroundColor Green
    }
} catch {
    Write-Host "⚠ SSH напрямую не работает, используем временное значение" -ForegroundColor Yellow
}

# Если не получилось через SSH, устанавливаем временное значение
if ([string]::IsNullOrWhiteSpace($jwtSecret)) {
    # Генерируем случайный JWT_SECRET локально как временное значение
    $bytes = [System.Text.Encoding]::ASCII.GetBytes((1..32 | ForEach-Object { [char](33 + (Get-Random -Maximum 94)) }) -join '')
    $jwtSecret = [Convert]::ToBase64String($bytes)
    Write-Host "⚠ Используется временный JWT_SECRET (обнови вручную после запуска на сервере)" -ForegroundColor Yellow
    Write-Host "  Командa для получения с сервера:" -ForegroundColor Gray
    Write-Host "  ssh root@$Server \"grep 'jwt-secret = ' /etc/postgrest/mansoni.conf | cut -d'\"' -f2\"" -ForegroundColor Gray
}

# Обновляем .env.local
Write-Host "`n→ Обновляю .env.local..." -ForegroundColor Yellow

$envFile = ".\.env.local"
if (Test-Path $envFile) {
    $content = Get-Content $envFile -Raw
    $content = $content -replace 'VITE_TIMEWEB_API_KEY=.*', "VITE_TIMEWEB_API_KEY=$jwtSecret"
    Set-Content -Path $envFile -Value $content -Encoding UTF8
    Write-Host "✓ .env.local обновлен" -ForegroundColor Green
} else {
    Write-Host "✗ Файл .env.local не найден!" -ForegroundColor Red
    exit 1
}

# Проверяем содержимое
Write-Host "`n✓ Конфигурация:" -ForegroundColor Green
$content = Get-Content $envFile
$content | Where-Object { $_ -match "VITE_TIMEWEB" -or $_ -match "TIMEWEB_DB" } | ForEach-Object {
    if ($_ -match "PASSWORD") {
        Write-Host "  $($_ -replace '=.*', '=***')" -ForegroundColor Gray
    } else {
        Write-Host "  $_" -ForegroundColor Gray
    }
}

Write-Host "`n╔═════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║              Готово к запуску! 🚀                ║" -ForegroundColor Green
Write-Host "╚═════════════════════════════════════════════════════╝" -ForegroundColor Green

Write-Host "`nМожешь запустить frontend:" -ForegroundColor Cyan
Write-Host "  npm run dev" -ForegroundColor Yellow
Write-Host ""

# Очищаем временный файл
Remove-Item $tempScript -ErrorAction SilentlyContinue
