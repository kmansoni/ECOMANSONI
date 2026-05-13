$content = Get-Content "c:\Users\manso\Desktop\разработка\mansoni\.env" -Raw
$content += "`n# Telegram OAuth`nVITE_TELEGRAM_BOT_ID=8784446400`nTELEGRAM_BOT_TOKEN=8784446400:AAHE6AlLrwzhrBGUFPZ4FwFLr7ZEuaz6gJw`n"
Set-Content -Path "c:\Users\manso\Desktop\разработка\mansoni\.env" -Value $content -NoNewline
Write-Host "Added"
