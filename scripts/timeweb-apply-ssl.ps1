#!/usr/bin/env pwsh
# Apply SSL and Nginx config on Timeweb server

param(
    [string]$Domain = "mansoni.ru",
    [string]$Server = "5.42.99.76",
    [string]$Email = "admin@mansoni.ru",
    [string]$RootPassword = "pzLgTT9Dn^XVQ8"
)

$ErrorActionPreference = "Stop"

Write-Host "`nApplying SSL for $Domain on $Server..." -ForegroundColor Cyan

if (-not (Get-Module -ListAvailable -Name Posh-SSH)) {
    Write-Host "Installing Posh-SSH module..." -ForegroundColor Yellow
    Install-Module -Name Posh-SSH -Force -Scope CurrentUser -SkipPublisherCheck -AllowClobber
}

Import-Module Posh-SSH

$serverScript = @'
#!/bin/bash
set -e

DOMAIN="__DOMAIN__"
EMAIL="__EMAIL__"

apt update
apt install -y certbot python3-certbot-nginx
systemctl stop nginx || true

certbot certonly --standalone -d $DOMAIN -d www.$DOMAIN \
  --email $EMAIL \
  --agree-tos \
  --non-interactive \
  --http-01-port 80
systemctl start nginx || true

tee /etc/nginx/sites-available/mansoni-api > /dev/null <<'EOFNGINX'
server {
    listen 80;
    server_name __DOMAIN__ www.__DOMAIN__;
    return 301 https://$server_name$request_uri;
}

upstream postgrest {
    server 127.0.0.1:3000;
    keepalive 64;
}

upstream turn_api {
    server 127.0.0.1:3001;
    keepalive 8;
}

server {
    listen 443 ssl http2;
    server_name __DOMAIN__ www.__DOMAIN__;

    ssl_certificate /etc/letsencrypt/live/__DOMAIN__/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/__DOMAIN__/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    access_log /var/log/nginx/mansoni-api-access.log;
    error_log /var/log/nginx/mansoni-api-error.log;

    client_max_body_size 10M;

    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, PATCH, DELETE, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, Accept, apikey, x-client-info' always;
    add_header 'Access-Control-Max-Age' '3600' always;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;

    if ($request_method = 'OPTIONS') {
        return 204;
    }

    location /turn-credentials {
        proxy_pass http://turn_api/turn-credentials;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://postgrest;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        access_log off;
        return 200 "OK\n";
        add_header Content-Type text/plain;
    }
}
EOFNGINX

nginx -t
systemctl restart nginx

'@

$serverScript = $serverScript -replace '__DOMAIN__', $Domain -replace '__EMAIL__', $Email


$secPassword = ConvertTo-SecureString $RootPassword -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential("root", $secPassword)

$tempFile = [System.IO.Path]::GetTempFileName() + ".sh"
Set-Content -Path $tempFile -Value $serverScript -Encoding ASCII

$session = New-SSHSession -ComputerName $Server -Credential $cred -AcceptKey -ConnectionTimeout 20
Set-SCPItem -ComputerName $Server -Credential $cred -Path $tempFile -Destination "/root" -NewName "setup-ssl.sh" -AcceptKey

$cmd = "sed -i 's/\r$//' /root/setup-ssl.sh && chmod +x /root/setup-ssl.sh && /root/setup-ssl.sh"
$result = Invoke-SSHCommand -SSHSession $session -Command $cmd -TimeOut 600
Remove-SSHSession -SSHSession $session | Out-Null

Remove-Item $tempFile -ErrorAction SilentlyContinue

if ($result.ExitStatus -ne 0) {
    Write-Host "SSL setup failed. Output:" -ForegroundColor Red
    Write-Host $result.Output
    Write-Host $result.Error
    exit 1
}

Write-Host "SSL and Nginx configured." -ForegroundColor Green
