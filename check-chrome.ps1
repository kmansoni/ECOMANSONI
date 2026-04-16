$ErrorActionPreference = "Stop"
try {
    & cmd /c "C:\Users\manso\Desktop\разработка\mansoni\run-hidden.bat"
    $chrome = Get-Process chrome -ErrorAction SilentlyContinue
    if ($chrome) {
        Write-Output "Chrome launched successfully"
    } else {
        Write-Output "Chrome may not have launched"
    }
} catch {
    Write-Output "Error: $_"
}
