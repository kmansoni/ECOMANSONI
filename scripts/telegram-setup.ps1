# telegram-setup.ps1 — настройка Telegram OAuth для Mansoni
# Использование: .\scripts\telegram-setup.ps1

param(
    [Parameter(Mandatory=$false)]
    [string]$Token
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $ProjectRoot ".env"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Mansoni — Telegram OAuth Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Функция для безопасного ввода
function Read-SecureInput {
    param([string]$Prompt)
    Write-Host -NoNewline "$Prompt`: "
    $secure = Read-Host -AsSecureString
    $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    $value = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr)
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    return $value
}

# Запрашиваем токен
if (-not $Token) {
    Write-Host "Введите Bot Token от @BotFather (ввод скрыт):" -ForegroundColor Yellow
    $Token = Read-SecureInput "Token"

    if (-not $Token) {
        Write-Host "Ошибка: Токен не может быть пустым" -ForegroundColor Red
        exit 1
    }

    Write-Host ""
    Write-Host "Подтвердите токен (введите ещё раз):" -ForegroundColor Yellow
    $TokenConfirm = Read-SecureInput "Confirm"

    if ($Token -ne $TokenConfirm) {
        Write-Host "Ошибка: Токены не совпадают" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "[1/2] Валидация токена через Telegram API..." -ForegroundColor Cyan

# Валидация через Telegram API
try {
    $response = Invoke-RestMethod -Uri "https://api.telegram.org/bot$Token/getMe" -Method Get
} catch {
    Write-Host "Ошибка: Не удалось подключиться к Telegram API" -ForegroundColor Red
    Write-Host "Проверьте токен и интернет-соединение" -ForegroundColor Yellow
    exit 1
}

if (-not $response.ok) {
    Write-Host "Ошибка: Неверный токен бота" -ForegroundColor Red
    Write-Host "Response: $($response.description)" -ForegroundColor Yellow
    exit 1
}

$BotId = $response.result.id
$BotUsername = $response.result.username
$BotName = $response.result.first_name

Write-Host "✅ Бот найден: @$BotUsername (ID: $BotId)" -ForegroundColor Green

# Читаем существующий .env
Write-Host ""
Write-Host "[2/2] Обновление .env..." -ForegroundColor Cyan

$envContent = @()
if (Test-Path $EnvFile) {
    $envContent = Get-Content $EnvFile -Raw

    # Backup
    $backupPath = "$EnvFile.backup.$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Copy-Item $EnvFile $backupPath
    Write-Host "📦 Backup: $backupPath" -ForegroundColor Gray
}

# Обновляем или добавляем переменные
$hasTelegramSection = $envContent -match "TELEGRAM"

if ($hasTelegramSection) {
    # Заменяем существующие Telegram переменные
    $envContent = $envContent -replace '(?m)^VITE_TELEGRAM_BOT_ID=.*', "VITE_TELEGRAM_BOT_ID=$BotId"
    $envContent = $envContent -replace '(?m)^TELEGRAM_BOT_TOKEN=.*', "TELEGRAM_BOT_TOKEN=$Token"
} else {
    # Добавляем секцию Telegram в конец
    $envContent += "`n# Telegram OAuth"
    $envContent += "VITE_TELEGRAM_BOT_ID=$BotId"
    $envContent += "TELEGRAM_BOT_TOKEN=$Token"
}

# Убираем лишние пустые строки в конце и сохраняем
$envContent = $envContent.TrimEnd() + "`n"
Set-Content -Path $EnvFile -Value $envContent -NoNewline

# Устанавливаем права (только владелец)
if ($IsWindows) {
    # Windows: убираем наследование, оставляем только владельца
    $acl = Get-Acl $EnvFile
    $acl.SetAccessRuleProtection($true, $true)
    # Удаляем все правила кроме текущего пользователя
    $acl.Access | ForEach-Object { $acl.RemoveAccessRule($_) | Out-Null }
    $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($currentUser, "FullControl", "Allow")
    $acl.AddAccessRule($rule)
    Set-Acl -Path $EnvFile -AclObject $acl
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  ✅ Настройка завершена!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Добавлено в .env:" -ForegroundColor Cyan
Write-Host "  VITE_TELEGRAM_BOT_ID=$BotId" -ForegroundColor Gray
Write-Host "  TELEGRAM_BOT_TOKEN=***" -ForegroundColor Gray
Write-Host ""
Write-Host "Следующие шаги:" -ForegroundColor Yellow
Write-Host "  1. supabase functions deploy telegram-auth"
Write-Host "  2. supabase secrets set TELEGRAM_BOT_TOKEN=$Token"
Write-Host ""