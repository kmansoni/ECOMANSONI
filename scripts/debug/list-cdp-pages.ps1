$ErrorActionPreference = "Stop"
$j = (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:9222/json).Content | ConvertFrom-Json
$j | Where-Object { $_.type -eq 'page' } | Select-Object url, title | Format-Table -AutoSize -Wrap
