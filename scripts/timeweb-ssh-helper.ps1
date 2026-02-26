# Timeweb SSH Helper - выполнение команд на сервере через SSH
param(
    [string]$Command,
    [string]$Server = "5.42.99.76",
    [string]$User = "root",
    [string]$Password = "pzLgTT9Dn^XVQ8"
)

# Создаем временный файл с паролем для sshpass-like функциональности
$env:SSHPASS = $Password

# Для Windows используем Posh-SSH
try {
    # Если Posh-SSH не установлен, устанавливаем
    if (-not (Get-Module -ListAvailable -Name Posh-SSH)) {
        Write-Host "Устанавливаю Posh-SSH модуль..." -ForegroundColor Yellow
        Install-Module -Name Posh-SSH -Force -Scope CurrentUser -SkipPublisherCheck -AllowClobber
    }
    
    Import-Module Posh-SSH -ErrorAction Stop
    
    # Создаем credential
    $secPassword = ConvertTo-SecureString $Password -AsPlainText -Force
    $cred = New-Object System.Management.Automation.PSCredential($User, $secPassword)
    
    # Создаем SSH сессию
    $session = New-SSHSession -ComputerName $Server -Credential $cred -AcceptKey
    
    # Выполняем команду
    $result = Invoke-SSHCommand -SSHSession $session -Command $Command
    
    # Выводим результат
    Write-Output $result.Output
    
    # Закрываем сессию
    Remove-SSHSession -SSHSession $session | Out-Null
    
} catch {
    Write-Host "Ошибка: $_" -ForegroundColor Red
    Write-Host "`nАльтернативный метод: открой веб-консоль Timeweb и выполни команду:" -ForegroundColor Yellow
    Write-Host $Command -ForegroundColor Cyan
}
