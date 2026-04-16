@echo off
setlocal

set "chrome=C:\Program Files\Google\Chrome\Application\chrome.exe"
set "url=https://wiki.soglasie.ru/partners/integration/products/eosago"

start "" "%chrome%" --new-window --incognito --disable-extensions --disable-webrtc --disable-geolocation --disable-third-party-cookies --disable-features=WebRTC --force-webrtc-ip-handling-policy=disable_non_proxied_udp "%url%"

echo Chrome launched in hidden mode for: %url%
echo.
echo Flags applied:
echo - Incognito mode
echo - No extensions
echo - WebRTC disabled
echo - Geolocation disabled  
echo - Third-party cookies blocked
echo.
pause