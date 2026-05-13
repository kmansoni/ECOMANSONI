$token = Read-Host -AsSecureString "Введите SUPABASE_SERVICE_ROLE_KEY"
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($token)
$Plain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)

$Path = "$env:USERPROFILE\.claude\mansoni-secrets.env"
$Content = "SUPABASE_SERVICE_ROLE_KEY=$Plain"
Set-Content -Path $Path -Value $Content -Encoding UTF8
Write-Host "Токен сохранён в $Path"
