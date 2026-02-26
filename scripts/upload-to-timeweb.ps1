#!/usr/bin/env pwsh
#
# Скрипт для загрузки файлов на Timeweb сервер
# Использование: .\upload-to-timeweb.ps1
#

$SERVER = "5.42.99.76"
$USER = "root"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ЗАГРУЗКА ФАЙЛОВ НА TIMEWEB СЕРВЕР" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Проверка существования файлов
$setupScript = "scripts\timeweb-full-setup.sh"
$migrations = "supabase\.temp\all-migrations.sql"

if (-not (Test-Path $setupScript)) {
    Write-Host "❌ Файл $setupScript не найден!" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $migrations)) {
    Write-Host "❌ Файл $migrations не найден!" -ForegroundColor Red
    Write-Host "Создай его сначала командой из PowerShell" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Найден скрипт установки: $setupScript" -ForegroundColor Green
Write-Host "✅ Найден файл миграций: $migrations ($(( Get-Item $migrations).Length / 1MB | ForEach-Object { '{0:N2}' -f $_ }) MB)" -ForegroundColor Green
Write-Host ""

# Выбор метода загрузки
Write-Host "Выбери метод загрузки:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. SCP (требует SSH пароль)" -ForegroundColor White
Write-Host "2. Показать инструкцию для веб-консоли Timeweb (рекомендуется)" -ForegroundColor Green
Write-Host "3. Создать архив для ручной загрузки" -ForegroundColor White
Write-Host ""

$choice = Read-Host "Введи номер (1-3)"

switch ($choice) {
    "1" {
        Write-Host ""
        Write-Host "Загрузка через SCP..." -ForegroundColor Cyan
        Write-Host ""
        
        Write-Host "📤 Загружаю скрипт установки..." -ForegroundColor Yellow
        scp $setupScript ${USER}@${SERVER}:/root/
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Скрипт загружен" -ForegroundColor Green
        } else {
            Write-Host "❌ Ошибка загрузки скрипта" -ForegroundColor Red
            exit 1
        }
        
        Write-Host ""
        Write-Host "📤 Загружаю миграции (это может занять минуту)..." -ForegroundColor Yellow
        scp $migrations ${USER}@${SERVER}:/root/
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Миграции загружены" -ForegroundColor Green
        } else {
            Write-Host "❌ Ошибка загрузки миграций" -ForegroundColor Red
            exit 1
        }
        
        Write-Host ""
        Write-Host "✅ Все файлы загружены успешно!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Теперь запусти установку:" -ForegroundColor Cyan
        Write-Host "  ssh ${USER}@${SERVER}" -ForegroundColor White
        Write-Host "  chmod +x /root/timeweb-full-setup.sh" -ForegroundColor White
        Write-Host "  /root/timeweb-full-setup.sh" -ForegroundColor White
    }
    
    "2" {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host "  ИНСТРУКЦИЯ ДЛЯ ВЕБ-КОНСОЛИ TIMEWEB" -ForegroundColor Cyan
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host ""
        
        Write-Host "1. Открой веб-консоль:" -ForegroundColor Yellow
        Write-Host "   https://timeweb.cloud → твой сервер → кнопка 'Консоль'" -ForegroundColor White
        Write-Host ""
        
        Write-Host "2. В консоли выполни команды для создания скрипта:" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "cat > /root/timeweb-full-setup.sh << 'EOFSCRIPT'" -ForegroundColor Cyan
        Write-Host ""
        
        # Выводим содержимое скрипта
        Get-Content $setupScript -Raw
        
        Write-Host ""
        Write-Host "EOFSCRIPT" -ForegroundColor Cyan
        Write-Host ""
        
        Write-Host "3. Загрузи миграции через веб-интерфейс:" -ForegroundColor Yellow
        Write-Host "   Timeweb → Файлы → Загрузить файл $migrations в /root/" -ForegroundColor White
        Write-Host ""
        
        Write-Host "4. Запусти установку:" -ForegroundColor Yellow
        Write-Host "   chmod +x /root/timeweb-full-setup.sh" -ForegroundColor Cyan
        Write-Host "   /root/timeweb-full-setup.sh" -ForegroundColor Cyan
        Write-Host ""
        
        Write-Host "Скопируй команды выше в веб-консоль Timeweb." -ForegroundColor Green
    }
    
    "3" {
        Write-Host ""
        Write-Host "Создаю архив для загрузки..." -ForegroundColor Cyan
        
        $archivePath = "timeweb-setup-files.zip"
        
        # Создаем временную директорию
        $tempDir = New-Item -ItemType Directory -Path "$env:TEMP\timeweb-setup-$(Get-Date -Format 'yyyyMMddHHmmss')" -Force
        
        Copy-Item $setupScript -Destination "$tempDir\timeweb-full-setup.sh"
        Copy-Item $migrations -Destination "$tempDir\all-migrations.sql"
        
        # Создаем README
        @"
ИНСТРУКЦИЯ ПО УСТАНОВКЕ:

1. Загрузи все файлы из этого архива на сервер в /root/
2. Подключись к серверу: ssh root@5.42.99.76
3. Дай права на выполнение: chmod +x /root/timeweb-full-setup.sh
4. Запусти установку: /root/timeweb-full-setup.sh
5. Следуй инструкциям в скрипте

Файлы:
- timeweb-full-setup.sh - скрипт автоматической установки
- all-migrations.sql - миграции базы данных (229 миграций)
"@ | Out-File -FilePath "$tempDir\README.txt" -Encoding UTF8
        
        # Создаем архив
        Compress-Archive -Path "$tempDir\*" -DestinationPath $archivePath -Force
        
        Remove-Item $tempDir -Recurse -Force
        
        Write-Host ""
        Write-Host "✅ Архив создан: $archivePath" -ForegroundColor Green
        Write-Host ""
        Write-Host "Загрузи этот архив на сервер и распакуй:" -ForegroundColor Yellow
        Write-Host "  scp $archivePath ${USER}@${SERVER}:/root/" -ForegroundColor White
        Write-Host "  ssh ${USER}@${SERVER}" -ForegroundColor White
        Write-Host "  cd /root && unzip timeweb-setup-files.zip" -ForegroundColor White
        Write-Host "  chmod +x timeweb-full-setup.sh" -ForegroundColor White
        Write-Host "  ./timeweb-full-setup.sh" -ForegroundColor White
    }
    
    default {
        Write-Host "❌ Неверный выбор" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
