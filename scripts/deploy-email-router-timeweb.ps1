#!/usr/bin/env pwsh
param(
    [string]$Server = "5.42.99.76",
    [string]$User = "root",
    [PSCredential]$Credential,
    [switch]$PromptForCredential,
    [string]$RemoteAppPath = "/opt/email-router",
    [string]$ServiceName = "email-router",
    [int]$Port = 8090,
    [string]$SupabaseUrl = "https://mansoni.ru",
    [string]$PostgrestUrl = "https://mansoni.ru/api",
    [string]$FromEmail = "noreply@mansoni.ru",
    [string]$SupabaseServiceRoleKey = "",
    [bool]$GenerateJwtFromRemote = $true,
    [bool]$EnsureMta = $true
)

$ErrorActionPreference = "Stop"

function Import-PoshSshModule {
    if (-not (Get-Module -ListAvailable -Name Posh-SSH)) {
        Write-Host "Installing Posh-SSH module..." -ForegroundColor Yellow
        Install-Module -Name Posh-SSH -Force -Scope CurrentUser -SkipPublisherCheck -AllowClobber
    }
    Import-Module Posh-SSH -ErrorAction Stop
}

function Resolve-Credential {
    param(
        [string]$Username,
        [PSCredential]$InitialCredential,
        [switch]$Prompt
    )

    if ($Prompt -or $null -eq $InitialCredential) {
        $secure = Read-Host "Timeweb root password" -AsSecureString
        return [PSCredential]::new($Username, $secure)
    }

    return $InitialCredential
}

function Get-RemoteJwtSecret {
    param($Session)

    $cmd = "grep -E '^jwt-secret[[:space:]]*=' /etc/postgrest/mansoni.conf | head -1 | cut -d'=' -f2- | xargs"
    $res = Invoke-SSHCommand -SSHSession $Session -Command $cmd -TimeOut 30
    if ($res.ExitStatus -ne 0) {
        throw "Failed to read jwt-secret from /etc/postgrest/mansoni.conf"
    }

    $secret = ($res.Output | Select-Object -First 1)
    if ([string]::IsNullOrWhiteSpace($secret)) {
        throw "jwt-secret is empty"
    }

    return $secret.Trim().Trim('"')
}

function New-MansoniJwt {
    param(
        [string]$Secret,
        [int]$Days = 365
    )

    $nodeScript = @'
const crypto = require("crypto");
const b64u = (obj) => Buffer.from(typeof obj === "string" ? obj : JSON.stringify(obj)).toString("base64url");
const secret = process.argv[1];
const days = Number(process.argv[2] || "365");
const now = Math.floor(Date.now() / 1000);
const header = { alg: "HS256", typ: "JWT" };
const payload = { role: "mansoni_app", iat: now, exp: now + days * 24 * 3600 };
const unsigned = b64u(header) + "." + b64u(payload);
const sig = crypto.createHmac("sha256", secret).update(unsigned).digest("base64url");
process.stdout.write(unsigned + "." + sig);
'@

    $token = node -e $nodeScript $Secret $Days
    if ([string]::IsNullOrWhiteSpace($token)) {
        throw "Failed to generate JWT token"
    }

    return $token.Trim()
}

Write-Host "Deploying email-router to $Server..." -ForegroundColor Cyan
Import-PoshSshModule

$cred = Resolve-Credential -Username $User -InitialCredential $Credential -Prompt:$PromptForCredential

$session = New-SSHSession -ComputerName $Server -Credential $cred -AcceptKey -ConnectionTimeout 30 -ErrorAction Stop

try {
    if ([string]::IsNullOrWhiteSpace($SupabaseServiceRoleKey)) {
        if ($GenerateJwtFromRemote) {
            Write-Host "Generating mansoni_app JWT from remote postgrest jwt-secret..." -ForegroundColor Yellow
            $jwtSecret = Get-RemoteJwtSecret -Session $session
            $SupabaseServiceRoleKey = New-MansoniJwt -Secret $jwtSecret -Days 365
        }
        else {
            throw "SupabaseServiceRoleKey is required when -GenerateJwtFromRemote is false"
        }
    }

    $zipPath = Join-Path $env:TEMP "email-router-deploy.zip"
    if (Test-Path -LiteralPath $zipPath) {
        Remove-Item -LiteralPath $zipPath -Force
    }

    $localEmailRouter = Join-Path $PSScriptRoot "..\services\email-router\*"
    Compress-Archive -Path $localEmailRouter -DestinationPath $zipPath -Force

    Write-Host "Uploading artifact..." -ForegroundColor Yellow
    Set-SCPItem -ComputerName $Server -Credential $cred -Path $zipPath -Destination "/root/" -NewName "email-router-deploy.zip" -AcceptKey -ErrorAction Stop

    $ensureMta = if ($EnsureMta) { "true" } else { "false" }
    $mtaBlock = @"
if [ "$ensureMta" = "true" ]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y >/dev/null
  apt-get install -y postfix mailutils unzip >/dev/null
  postconf -e "myhostname=mansoni.ru"
  postconf -e "myorigin=/etc/mailname"
  postconf -e "inet_interfaces=loopback-only"
  postconf -e "mydestination=localhost"
  postconf -e "relayhost="
  postconf -e "smtp_tls_security_level=may"
  postconf -e "smtp_tls_loglevel=1"
  systemctl enable postfix >/dev/null 2>&1 || true
  systemctl restart postfix
else
  apt-get update -y >/dev/null
  apt-get install -y unzip >/dev/null
fi
"@

    $remoteDeploy = @"
set -e
$mtaBlock
mkdir -p '$RemoteAppPath'
rm -rf '$RemoteAppPath'/*
unzip -oq /root/email-router-deploy.zip -d '$RemoteAppPath'

cd '$RemoteAppPath'
npm install --silent
npm run build >/dev/null 2>&1

cat > /etc/default/$ServiceName <<'EOF'
SUPABASE_URL=$SupabaseUrl
SUPABASE_SERVICE_ROLE_KEY=$SupabaseServiceRoleKey
EMAIL_ROUTER_POSTGREST_URL=$PostgrestUrl
EMAIL_ROUTER_PROVIDER=sendmail
SENDMAIL_PATH=/usr/sbin/sendmail
EMAIL_ROUTER_DEFAULT_FROM=$FromEmail
EMAIL_ROUTER_PORT=$Port
EMAIL_ROUTER_POLL_MS=2000
EMAIL_ROUTER_BATCH_SIZE=25
EMAIL_ROUTER_LOCK_SECONDS=90
EOF
chmod 600 /etc/default/$ServiceName

cat > /etc/systemd/system/$ServiceName.service <<'EOF'
[Unit]
Description=Mansoni Email Router
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$RemoteAppPath
EnvironmentFile=/etc/default/$ServiceName
ExecStart=/usr/bin/node --enable-source-maps $RemoteAppPath/dist/index.js
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

fuser -k $Port/tcp || true
pkill -f '$RemoteAppPath/dist/index.js' || true

systemctl daemon-reload
systemctl enable $ServiceName >/dev/null 2>&1 || true
systemctl restart $ServiceName
sleep 2
systemctl is-active $ServiceName
curl -sS -m 8 http://127.0.0.1:$Port/health
"@

    Write-Host "Running remote deploy script..." -ForegroundColor Yellow
    $result = Invoke-SSHCommand -SSHSession $session -Command $remoteDeploy -TimeOut 600

    if ($result.ExitStatus -ne 0) {
        Write-Host "Deploy failed:" -ForegroundColor Red
        if ($result.Output) { Write-Host ($result.Output -join "`n") }
        if ($result.Error) { Write-Host ($result.Error -join "`n") }
        throw "Remote deploy failed"
    }

    Write-Host "Deploy completed successfully." -ForegroundColor Green
    if ($result.Output) {
        Write-Host ($result.Output -join "`n")
    }
}
finally {
    Remove-SSHSession -SSHSession $session | Out-Null
}
