<#
.SYNOPSIS
  Настройка SMTP в Supabase Auth для отправки OTP-кодов через mail.mansoni.ru.

.DESCRIPTION
  Использует Supabase Management API (PATCH /v1/projects/{ref}/config/auth)
  для конфигурации:
    - SMTP-сервер (host, port, user, pass)
    - Имя отправителя и адрес
    - Русскоязычные email-шаблоны для OTP / подтверждения / сброса пароля

.PARAMETER ProjectRef
  Supabase project ref (по умолчанию — из supabase/config.toml)

.PARAMETER SmtpHost
  SMTP-хост (по умолчанию mail.mansoni.ru)

.PARAMETER SmtpPort
  SMTP-порт (по умолчанию 587 = STARTTLS)

.PARAMETER SmtpUser
  SMTP-логин (по умолчанию noreply@mansoni.ru)

.PARAMETER SenderName
  Имя отправителя (по умолчанию ECOMANSONI)

.PARAMETER SenderEmail
  Адрес отправителя (по умолчанию noreply@mansoni.ru)

.PARAMETER DryRun
  Только показать JSON, не отправлять запрос

.EXAMPLE
  .\configure-supabase-smtp.ps1
  .\configure-supabase-smtp.ps1 -DryRun
  .\configure-supabase-smtp.ps1 -SmtpHost smtp.gmail.com -SmtpPort 465 -SmtpUser user@gmail.com
#>

param(
  [string]$ProjectRef = "",
  [string]$SmtpHost = "mail.mansoni.ru",
  [int]$SmtpPort = 587,
  [string]$SmtpUser = "noreply@mansoni.ru",
  [string]$SenderName = "ECOMANSONI",
  [string]$SenderEmail = "noreply@mansoni.ru",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# ─── Resolve project ref ────────────────────────────────────────────────────
function Resolve-ProjectRef([string]$PreferredRef) {
  if (-not [string]::IsNullOrWhiteSpace($PreferredRef)) { return $PreferredRef.Trim() }
  if (-not [string]::IsNullOrWhiteSpace($env:SUPABASE_PROJECT_REF)) { return $env:SUPABASE_PROJECT_REF.Trim() }

  $configPath = Join-Path (Join-Path $PSScriptRoot "..") "supabase\config.toml"
  if (Test-Path -LiteralPath $configPath) {
    $line = Get-Content -LiteralPath $configPath |
      Where-Object { $_ -match '^\s*project_id\s*=\s*"([a-z0-9-]+)"\s*$' } |
      Select-Object -First 1
    if ($line) {
      $m = [regex]::Match($line, '"([a-z0-9-]+)"')
      if ($m.Success) { return $m.Groups[1].Value }
    }
  }
  throw "Не удалось определить project ref. Укажите -ProjectRef или SUPABASE_PROJECT_REF."
}

# ─── Read secrets securely ──────────────────────────────────────────────────
function Read-SecureString([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Resolve-AccessToken {
  if (-not [string]::IsNullOrWhiteSpace($env:SUPABASE_ACCESS_TOKEN)) {
    Write-Host "✓ Используем SUPABASE_ACCESS_TOKEN из env" -ForegroundColor Green
    return $env:SUPABASE_ACCESS_TOKEN
  }
  $userEnv = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'User')
  if (-not [string]::IsNullOrWhiteSpace($userEnv)) {
    Write-Host "✓ Используем SUPABASE_ACCESS_TOKEN из User env" -ForegroundColor Green
    return $userEnv
  }
  return Read-SecureString "Supabase Access Token (sbp_...)"
}

# ─── Email templates (русский) ──────────────────────────────────────────────

# OTP / Magic Link шаблон (используется при signInWithOtp)
$otpTemplate = @'
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
    .container { max-width: 480px; margin: 40px auto; background: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); padding: 40px; }
    .logo { text-align: center; font-size: 24px; font-weight: 700; color: #1a1a1a; margin-bottom: 24px; }
    .code { text-align: center; font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #2563eb; background: #eff6ff; border-radius: 8px; padding: 16px 24px; margin: 24px 0; font-family: 'SF Mono', 'Fira Code', monospace; }
    .text { color: #4b5563; font-size: 15px; line-height: 1.6; text-align: center; }
    .footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 32px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">ECOMANSONI</div>
    <p class="text">Ваш код подтверждения для входа:</p>
    <div class="code">{{ .Token }}</div>
    <p class="text">Код действителен 10 минут.<br>Если вы не запрашивали вход — просто проигнорируйте это письмо.</p>
    <div class="footer">&copy; ECOMANSONI &mdash; mansoni.ru</div>
  </div>
</body>
</html>
'@

# Подтверждение email (signup confirmation)
$confirmTemplate = @'
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
    .container { max-width: 480px; margin: 40px auto; background: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); padding: 40px; }
    .logo { text-align: center; font-size: 24px; font-weight: 700; color: #1a1a1a; margin-bottom: 24px; }
    .code { text-align: center; font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #2563eb; background: #eff6ff; border-radius: 8px; padding: 16px 24px; margin: 24px 0; font-family: 'SF Mono', 'Fira Code', monospace; }
    .text { color: #4b5563; font-size: 15px; line-height: 1.6; text-align: center; }
    .footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 32px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">ECOMANSONI</div>
    <p class="text">Подтвердите ваш email:</p>
    <div class="code">{{ .Token }}</div>
    <p class="text">Введите этот код в приложении для завершения регистрации.<br>Код действителен 10 минут.</p>
    <div class="footer">&copy; ECOMANSONI &mdash; mansoni.ru</div>
  </div>
</body>
</html>
'@

# Смена email
$emailChangeTemplate = @'
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
    .container { max-width: 480px; margin: 40px auto; background: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); padding: 40px; }
    .logo { text-align: center; font-size: 24px; font-weight: 700; color: #1a1a1a; margin-bottom: 24px; }
    .code { text-align: center; font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #2563eb; background: #eff6ff; border-radius: 8px; padding: 16px 24px; margin: 24px 0; font-family: 'SF Mono', 'Fira Code', monospace; }
    .text { color: #4b5563; font-size: 15px; line-height: 1.6; text-align: center; }
    .footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 32px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">ECOMANSONI</div>
    <p class="text">Подтвердите смену email:</p>
    <div class="code">{{ .Token }}</div>
    <p class="text">Если вы не меняли email — проигнорируйте это письмо.</p>
    <div class="footer">&copy; ECOMANSONI &mdash; mansoni.ru</div>
  </div>
</body>
</html>
'@

# ─── Main ───────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Настройка SMTP для Supabase Auth           ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$ref = Resolve-ProjectRef $ProjectRef
Write-Host "  Project ref : $ref" -ForegroundColor White
Write-Host "  SMTP host   : $SmtpHost" -ForegroundColor White
Write-Host "  SMTP port   : $SmtpPort" -ForegroundColor White
Write-Host "  SMTP user   : $SmtpUser" -ForegroundColor White
Write-Host "  Отправитель : $SenderName <$SenderEmail>" -ForegroundColor White
Write-Host ""

# Пароль SMTP
$smtpPass = Read-SecureString "SMTP-пароль для $SmtpUser"
if ([string]::IsNullOrWhiteSpace($smtpPass)) {
  throw "SMTP-пароль не может быть пустым."
}

# Access token
$token = Resolve-AccessToken
if ([string]::IsNullOrWhiteSpace($token)) {
  throw "Access token пустой."
}

# ─── Build config payload ───────────────────────────────────────────────────
$config = @{
  # SMTP
  SMTP_ADMIN_EMAIL       = $SenderEmail
  SMTP_HOST              = $SmtpHost
  SMTP_PORT              = "$SmtpPort"
  SMTP_USER              = $SmtpUser
  SMTP_PASS              = $smtpPass
  SMTP_SENDER_NAME       = $SenderName
  SMTP_MAX_FREQUENCY     = 30     # Минимум 30 секунд между письмами одному получателю

  # Включить email OTP
  EXTERNAL_EMAIL_ENABLED = $true
  MAILER_AUTOCONFIRM     = $false

  # OTP настройки
  MAILER_OTP_EXP         = 600   # 10 минут
  MAILER_OTP_LENGTH      = 6     # 6-значный код

  # Темы писем (русский)
  MAILER_SUBJECTS_MAGIC_LINK       = "Ваш код входа — ECOMANSONI"
  MAILER_SUBJECTS_CONFIRMATION     = "Подтверждение email — ECOMANSONI"
  MAILER_SUBJECTS_EMAIL_CHANGE     = "Смена email — ECOMANSONI"
  MAILER_SUBJECTS_RECOVERY         = "Восстановление пароля — ECOMANSONI"

  # HTML-шаблоны
  MAILER_TEMPLATES_MAGIC_LINK_CONTENT   = $otpTemplate
  MAILER_TEMPLATES_CONFIRMATION_CONTENT = $confirmTemplate
  MAILER_TEMPLATES_EMAIL_CHANGE_CONTENT = $emailChangeTemplate

  # Безопасность: подтверждение обоих email при смене
  MAILER_SECURE_EMAIL_CHANGE_ENABLED = $true

  # Site URL (для ссылок в письмах)
  SITE_URL = "https://mansoni.ru"
}

$jsonBody = $config | ConvertTo-Json -Depth 4 -Compress

if ($DryRun) {
  Write-Host ""
  Write-Host "═══ DRY RUN — JSON payload (пароль скрыт) ═══" -ForegroundColor Yellow
  $displayConfig = $config.Clone()
  $displayConfig.SMTP_PASS = "********"
  $displayConfig | ConvertTo-Json -Depth 4 | Write-Host
  Write-Host ""
  Write-Host "Для применения запустите без -DryRun" -ForegroundColor Yellow
  return
}

# ─── Apply via Management API ───────────────────────────────────────────────
$apiUrl = "https://api.supabase.com/v1/projects/$ref/config/auth"

Write-Host ""
Write-Host "Применяем настройки через Management API..." -ForegroundColor Cyan

try {
  $response = Invoke-RestMethod -Uri $apiUrl -Method Patch `
    -Headers @{
      Authorization  = "Bearer $token"
      "Content-Type" = "application/json"
    } `
    -Body $jsonBody `
    -ErrorAction Stop

  Write-Host ""
  Write-Host "✅ SMTP успешно настроен!" -ForegroundColor Green
  Write-Host ""
  Write-Host "Проверка:" -ForegroundColor White
  Write-Host "  SMTP host  : $($response.SMTP_HOST)"    -ForegroundColor Gray
  Write-Host "  SMTP port  : $($response.SMTP_PORT)"    -ForegroundColor Gray
  Write-Host "  SMTP user  : $($response.SMTP_USER)"    -ForegroundColor Gray
  Write-Host "  Sender     : $($response.SMTP_SENDER_NAME) <$($response.SMTP_ADMIN_EMAIL)>" -ForegroundColor Gray
  Write-Host "  OTP length : $($response.MAILER_OTP_LENGTH)" -ForegroundColor Gray
  Write-Host "  OTP expire : $($response.MAILER_OTP_EXP) сек" -ForegroundColor Gray
  Write-Host ""
  Write-Host "Теперь Supabase Auth будет отправлять OTP-коды через $SmtpHost." -ForegroundColor Green
}
catch {
  $err = $_
  Write-Host ""
  Write-Host "❌ Ошибка при настройке SMTP:" -ForegroundColor Red

  if ($err.Exception.Response) {
    $statusCode = [int]$err.Exception.Response.StatusCode
    Write-Host "  HTTP $statusCode" -ForegroundColor Red

    try {
      $reader = [System.IO.StreamReader]::new($err.Exception.Response.GetResponseStream())
      $body = $reader.ReadToEnd()
      $reader.Close()
      Write-Host "  $body" -ForegroundColor Red
    } catch {}

    if ($statusCode -eq 401) {
      Write-Host ""
      Write-Host "  Токен недействителен. Получите новый на:" -ForegroundColor Yellow
      Write-Host "  https://app.supabase.com/account/tokens" -ForegroundColor Cyan
    }
  }
  else {
    Write-Host "  $($err.Exception.Message)" -ForegroundColor Red
  }

  throw
}
