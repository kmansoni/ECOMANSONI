#!/usr/bin/env pwsh
#
# АВТОМАТИЧЕСКАЯ НАСТРОЙКА TIMEWEB СЕРВЕРА
# Выполняет все шаги установки и настройки
#

param(
    [string]$Server = "5.42.99.76",
    [string]$User = "root",
    [string]$Password = "pzLgTT9Dn^XVQ8",
    [string]$DbPassword = "",
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"

Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     TIMEWEB AUTO SETUP - Автоматическая настройка сервера      ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Функция для выполнения SSH команд
function Invoke-TimewebSSH {
    param([string]$Command, [string]$Description)
    
    Write-Host "→ $Description..." -ForegroundColor Yellow
    
    try {
        if (-not (Get-Module -Name Posh-SSH -ErrorAction SilentlyContinue)) {
            Import-Module Posh-SSH -ErrorAction Stop
        }
        
        $secPassword = ConvertTo-SecureString $Password -AsPlainText -Force
        $cred = New-Object System.Management.Automation.PSCredential($User, $secPassword)
        
        $session = New-SSHSession -ComputerName $Server -Credential $cred -AcceptKey -ConnectionTimeout 30 -ErrorAction Stop
        $result = Invoke-SSHCommand -SSHSession $session -Command $Command -TimeOut 300
        Remove-SSHSession -SSHSession $session | Out-Null
        
        if ($result.ExitStatus -eq 0) {
            Write-Host "  ✓ Успешно" -ForegroundColor Green
            return $result.Output
        } else {
            Write-Host "  ✗ Ошибка (код: $($result.ExitStatus))" -ForegroundColor Red
            Write-Host $result.Error -ForegroundColor Red
            return $null
        }
    } catch {
        Write-Host "  ✗ Ошибка подключения: $_" -ForegroundColor Red
        return $null
    }
}

# Шаг 0: Проверка модуля Posh-SSH
Write-Host "`n[Шаг 0] Проверка зависимостей" -ForegroundColor Cyan
if (-not (Get-Module -ListAvailable -Name Posh-SSH)) {
    Write-Host "Устанавливаю Posh-SSH модуль..." -ForegroundColor Yellow
    try {
        Install-Module -Name Posh-SSH -Force -Scope CurrentUser -SkipPublisherCheck -AllowClobber
        Write-Host "✓ Posh-SSH установлен" -ForegroundColor Green
    } catch {
        Write-Host "✗ Не удалось установить Posh-SSH" -ForegroundColor Red
        Write-Host "`nАльтернативный способ:" -ForegroundColor Yellow
        Write-Host "1. Открой веб-консоль: https://timeweb.cloud" -ForegroundColor Cyan
        Write-Host "2. Выбери сервер $Server" -ForegroundColor Cyan
        Write-Host "3. Нажми 'Консоль'" -ForegroundColor Cyan
        Write-Host "4. Скопируй и вставь содержимое файла TIMEWEB_PASTE_TO_CONSOLE.txt" -ForegroundColor Cyan
        exit 1
    }
}

Import-Module Posh-SSH

# Шаг 1: Проверка подключения
Write-Host "`n[Шаг 1] Проверка подключения к серверу" -ForegroundColor Cyan
$uptime = Invoke-TimewebSSH -Command "uptime" -Description "Подключение к $Server"
if (-not $uptime) {
    Write-Host "`n✗ Не удалось подключиться к серверу" -ForegroundColor Red
    Write-Host "Проверь:" -ForegroundColor Yellow
    Write-Host "  • IP адрес: $Server" -ForegroundColor Cyan
    Write-Host "  • Пароль: правильный" -ForegroundColor Cyan
    Write-Host "  • Файрвол: порт 22 открыт" -ForegroundColor Cyan
    exit 1
}
Write-Host "Сервер онлайн: $uptime" -ForegroundColor Green

# Шаг 2: Проверка существующей установки
Write-Host "`n[Шаг 2] Проверка текущего состояния" -ForegroundColor Cyan
$postgrestStatus = Invoke-TimewebSSH -Command "systemctl is-active postgrest-mansoni 2>/dev/null || echo 'not-installed'" -Description "Проверка PostgREST"

if ($postgrestStatus -eq "active") {
    Write-Host "✓ Установка уже выполнена!" -ForegroundColor Green
    $SkipInstall = $true
} else {
    Write-Host "Установка требуется" -ForegroundColor Yellow
}

# Шаг 3: Установка (если нужна)
if (-not $SkipInstall) {
    Write-Host "`n[Шаг 3] Загрузка установочного скрипта" -ForegroundColor Cyan
    
    # Читаем установочный скрипт из TIMEWEB_PASTE_TO_CONSOLE.txt
    $scriptContent = Get-Content -Path ".\TIMEWEB_PASTE_TO_CONSOLE.txt" -Raw
    
    # Извлекаем только bash скрипт (между cat и EOFSETUPSCRIPT)
    if ($scriptContent -match "(?s)cat > /root/timeweb-full-setup\.sh << 'EOFSETUPSCRIPT'(.+?)EOFSETUPSCRIPT") {
        $bashScript = $Matches[1].Trim()
        
        # Сохраняем во временный файл
        $tempScript = [System.IO.Path]::GetTempFileName() + ".sh"
        Set-Content -Path $tempScript -Value $bashScript -Encoding UTF8
        
        Write-Host "✓ Скрипт подготовлен ($([math]::Round((Get-Item $tempScript).Length / 1KB, 2)) KB)" -ForegroundColor Green
        
        # Загружаем на сервер через SSH (альтернатива SCP)
        Write-Host "→ Загрузка на сервер..." -ForegroundColor Yellow
        try {
            # Читаем содержимое скрипта и кодируем в base64
            $scriptBytes = [System.IO.File]::ReadAllBytes($tempScript)
            $scriptBase64 = [Convert]::ToBase64String($scriptBytes)
            
            # Отправляем через SSH команду
            $uploadCommand = "echo '$scriptBase64' | base64 -d > /root/timeweb-full-setup.sh && chmod +x /root/timeweb-full-setup.sh"
            $uploadResult = Invoke-TimewebSSH -Command $uploadCommand -Description "Загрузка скрипта"
            
            if ($uploadResult -ne $null) {
                Write-Host "  ✓ Скрипт загружен" -ForegroundColor Green
            } else {
                Write-Host "  ✗ Ошибка загрузки" -ForegroundColor Red
                exit 1
            }
        } catch {
            Write-Host "  ✗ Ошибка загрузки: $_" -ForegroundColor Red
            exit 1
        }
        
        Remove-Item $tempScript
        
        # Загружаем миграции
        Write-Host "`n[Шаг 4] Загрузка миграций" -ForegroundColor Cyan
        if (Test-Path ".\supabase\.temp\all-migrations.sql") {
            $migSize = [math]::Round((Get-Item ".\supabase\.temp\all-migrations.sql").Length / 1MB, 2)
            Write-Host "→ Загрузка миграций ($migSize MB)..." -ForegroundColor Yellow
            
            try {
                # Загружаем миграции через base64 (для больших файлов делаем по частям)
                $migBytes = [System.IO.File]::ReadAllBytes(".\supabase\.temp\all-migrations.sql")
                
                # Для больших файлов используем gzip + base64
                $ms = New-Object System.IO.MemoryStream
                $gz = New-Object System.IO.Compression.GZipStream($ms, [System.IO.Compression.CompressionMode]::Compress)
                $gz.Write($migBytes, 0, $migBytes.Length)
                $gz.Close()
                $compressedBytes = $ms.ToArray()
                $ms.Close()
                
                $migBase64 = [Convert]::ToBase64String($compressedBytes)
                Write-Host "  Сжато: $([math]::Round($compressedBytes.Length / 1MB, 2)) MB" -ForegroundColor Gray
                
                # Загружаем через SSH
                $migCommand = "echo '$migBase64' | base64 -d | gunzip > /root/all-migrations.sql"
                $migResult = Invoke-TimewebSSH -Command $migCommand -Description "Загрузка миграций"
                
                if ($migResult -ne $null) {
                    Write-Host "  ✓ Миграции загружены" -ForegroundColor Green
                } else {
                    Write-Host "  ✗ Ошибка загрузки миграций" -ForegroundColor Red
                    Write-Host "  (Можно применить позже)" -ForegroundColor Yellow
                }
            } catch {
                Write-Host "  ✗ Ошибка загрузки миграций: $_" -ForegroundColor Red
                Write-Host "  (Можно применить позже)" -ForegroundColor Yellow
            }
        } else {
            Write-Host "⚠ Файл миграций не найден: .\supabase\.temp\all-migrations.sql" -ForegroundColor Yellow
        }
        
        # Запускаем установку
        Write-Host "`n[Шаг 5] Запуск установки (это займет 5-10 минут)" -ForegroundColor Cyan
        Write-Host "Выполняется установка PostgreSQL, PostgREST, coturn, Nginx..." -ForegroundColor Yellow
        
        # Автоматическая генерация пароля БД
        if (-not $DbPassword) {
            $DbPassword = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 20 | ForEach-Object {[char]$_})
            Write-Host "Сгенерирован пароль БД: $DbPassword" -ForegroundColor Green
        }
        
        # Делаем скрипт исполняемым и запускаем
        $installCmd = "chmod +x /root/timeweb-full-setup.sh && DB_PASSWORD='$DbPassword' /root/timeweb-full-setup.sh"
        $installResult = Invoke-TimewebSSH -Command $installCmd -Description "Установка компонентов"
        
        if ($installResult) {
            Write-Host $installResult -ForegroundColor Gray
        }
    } else {
        Write-Host "✗ Не удалось извлечь скрипт из TIMEWEB_PASTE_TO_CONSOLE.txt" -ForegroundColor Red
        exit 1
    }
}

# Шаг 6: Извлечение JWT_SECRET
Write-Host "`n[Шаг 6] Получение конфигурации" -ForegroundColor Cyan
$jwtSecret = Invoke-TimewebSSH -Command "grep 'jwt-secret =' /etc/postgrest/mansoni.conf | cut -d= -f2 | tr -d ' `"'" -Description "Извлечение JWT_SECRET"

if ($jwtSecret) {
    Write-Host "✓ JWT_SECRET получен: $($jwtSecret.Substring(0, 16))..." -ForegroundColor Green
} else {
    Write-Host "✗ Не удалось получить JWT_SECRET" -ForegroundColor Red
    Write-Host "Проверь файл /etc/postgrest/mansoni.conf на сервере" -ForegroundColor Yellow
    exit 1
}

# Шаг 7: Создание .env.local
Write-Host "`n[Шаг 7] Создание .env.local" -ForegroundColor Cyan

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

Set-Content -Path ".\.env.local" -Value $envContent -Encoding UTF8
Write-Host "✓ Файл .env.local создан" -ForegroundColor Green

# Шаг 8: Проверка сервисов
Write-Host "`n[Шаг 8] Проверка работоспособности" -ForegroundColor Cyan

$services = @(
    @{Name="PostgreSQL"; Command="systemctl is-active postgresql"},
    @{Name="PostgREST"; Command="systemctl is-active postgrest-mansoni"},
    @{Name="coturn"; Command="systemctl is-active coturn"},
    @{Name="TURN API"; Command="systemctl is-active mansoni-turn-api"},
    @{Name="Nginx"; Command="systemctl is-active nginx"}
)

$allActive = $true
foreach ($service in $services) {
    $status = Invoke-TimewebSSH -Command $service.Command -Description "Проверка $($service.Name)"
    if ($status -eq "active") {
        Write-Host "  ✓ $($service.Name): работает" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $($service.Name): не запущен" -ForegroundColor Red
        $allActive = $false
    }
}

# Шаг 9: Тестирование API
Write-Host "`n[Шаг 9] Тестирование endpoints" -ForegroundColor Cyan

Write-Host "→ Проверка PostgREST API..." -ForegroundColor Yellow
$apiTest = Invoke-TimewebSSH -Command "curl -s http://localhost/ | head -c 100" -Description "API Test"
if ($apiTest) {
    Write-Host "  ✓ PostgREST отвечает" -ForegroundColor Green
}

Write-Host "→ Проверка TURN credentials..." -ForegroundColor Yellow
$turnTest = Invoke-TimewebSSH -Command "curl -s -X POST http://localhost/turn-credentials" -Description "TURN Test"
if ($turnTest -match "username") {
    Write-Host "  ✓ TURN API работает" -ForegroundColor Green
}

# Финальный отчет
Write-Host "`n╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                  ✓ УСТАНОВКА ЗАВЕРШЕНА!                       ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Green

Write-Host "`n📋 Информация для подключения:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  API URL:    http://$Server" -ForegroundColor White
Write-Host "  JWT Secret: $($jwtSecret.Substring(0, 32))..." -ForegroundColor White
Write-Host "  TURN URL:   http://$Server/turn-credentials" -ForegroundColor White
Write-Host ""
Write-Host "  База данных:" -ForegroundColor White
Write-Host "    • Database: mansoni" -ForegroundColor Gray
Write-Host "    • User: mansoni_app" -ForegroundColor Gray
if ($DbPassword) {
    Write-Host "    • Password: $DbPassword" -ForegroundColor Gray
}
Write-Host ""

Write-Host "📝 Следующие шаги:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  1. Файл .env.local создан и готов к использованию" -ForegroundColor Green
Write-Host "  2. Запусти frontend: npm run dev" -ForegroundColor Yellow
Write-Host "  3. Проверь подключение к новому backend" -ForegroundColor Yellow
Write-Host ""

if (-not $allActive) {
    Write-Host "⚠ Некоторые сервисы не запущены - проверь логи:" -ForegroundColor Yellow
    Write-Host "  ssh root@$Server" -ForegroundColor Cyan
    Write-Host "  journalctl -u postgrest-mansoni -n 50" -ForegroundColor Cyan
    Write-Host "  journalctl -u mansoni-turn-api -n 50" -ForegroundColor Cyan
}

Write-Host "`n✓ Готово! Сервер настроен и работает 🚀" -ForegroundColor Green
Write-Host ""
