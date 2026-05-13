$ErrorActionPreference = "Stop"

$envFile = "$env:USERPROFILE\.claude\mansoni-secrets.env"

Write-Host "=== Supabase Personal Access Token ===" -ForegroundColor Cyan
Write-Host ""

$token = Read-Host -AsSecureString "Enter SUPABASE_ACCESS_TOKEN (Personal Access Token from supabase.com/dashboard/account/tokens)"

$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($token)
$PlainToken = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)

$Content = "SUPABASE_ACCESS_TOKEN=$PlainToken`nSUPABASE_PROJECT_REF=lfkbgnbjxskspsownvjm"
Set-Content -Path $envFile -Value $Content -Encoding UTF8

Write-Host ""
Write-Host "Token saved!" -ForegroundColor Green
Write-Host ""
Write-Host "Testing deployment..." -ForegroundColor Cyan

$env:SUPABASE_ACCESS_TOKEN = $PlainToken

Push-Location "c:\Users\manso\Desktop\разработка\mansoni"
npx supabase functions deploy post-reminder-notify --project-ref lfkbgnbjxskspsownvjm --no-verify-jwt
Pop-Location

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
Read-Host