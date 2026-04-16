param(
    [string]$url = "https://wiki.soglasie.ru/partners/integration/products/eosago"
)

$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"

$flags = @(
    "--new-window",
    "--incognito",
    "--disable-extensions",
    "--disable-webrtc",
    "--disable-geolocation",
    "--disable-third-party-cookies",
    "--disable-features=WebRTC",
    "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--disable-media-session",
    "--disable-speech-api",
    "--disable-features=TranslateUI",
    "--hide-crash-restore-bubble",
    "--no-default-browser-check",
    "--no-first-run"
)

$processInfo = New-Object System.Diagnostics.ProcessStartInfo
$processInfo.FileName = $chrome
$processInfo.UseShellExecute = $false
$processInfo.Arguments = ($flags + @($url)) -join " "

$process = [System.Diagnostics.Process]::Start($processInfo)
Write-Host "Chrome launched with hidden mode for: $url"