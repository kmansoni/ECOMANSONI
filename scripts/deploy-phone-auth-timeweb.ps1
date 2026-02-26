#!/usr/bin/env pwsh
# Deploy phone-auth service changes to Timeweb server

param(
    [string]$Server = "5.42.99.76",
    [string]$User = "root",
    [string]$Password = "pzLgTT9Dn^XVQ8",
    [string]$RemoteAppPath = "/opt/mansoni-phone-auth"
)

$ErrorActionPreference = "Stop"

Write-Host "Deploying phone-auth to $Server..." -ForegroundColor Cyan

if (-not (Get-Module -ListAvailable -Name Posh-SSH)) {
    Write-Host "Installing Posh-SSH module..." -ForegroundColor Yellow
    Install-Module -Name Posh-SSH -Force -Scope CurrentUser -SkipPublisherCheck -AllowClobber
}

Import-Module Posh-SSH -ErrorAction Stop

$secPassword = ConvertTo-SecureString $Password -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential($User, $secPassword)
$session = New-SSHSession -ComputerName $Server -Credential $cred -AcceptKey -ConnectionTimeout 30 -ErrorAction Stop

try {
    $localPhoneAuth = Join-Path $PSScriptRoot "..\server\phone-auth"

    $prepareCmd = "mkdir -p '$RemoteAppPath'"
    $prepareResult = Invoke-SSHCommand -SSHSession $session -Command $prepareCmd -TimeOut 60
    if ($prepareResult.ExitStatus -ne 0) {
        throw "Failed to prepare remote directory: $RemoteAppPath"
    }

    $filesToUpload = @(
        "index.mjs",
        "package.json",
        "package-lock.json",
        "README.md"
    )

    foreach ($file in $filesToUpload) {
        $localPath = Join-Path $localPhoneAuth $file
        if (-not (Test-Path -LiteralPath $localPath)) {
            throw "Local file not found: $localPath"
        }

        Write-Host "Uploading $file..." -ForegroundColor Yellow
        Set-SCPItem -ComputerName $Server -Credential $cred -Path $localPath -Destination $RemoteAppPath -NewName $file -AcceptKey -ErrorAction Stop
    }

    $bootstrapScriptLocal = Join-Path $PSScriptRoot "phone-auth-remote-bootstrap.sh"
    if (-not (Test-Path -LiteralPath $bootstrapScriptLocal)) {
        throw "Bootstrap script not found: $bootstrapScriptLocal"
    }
    Set-SCPItem -ComputerName $Server -Credential $cred -Path $bootstrapScriptLocal -Destination "/tmp" -NewName "phone-auth-remote-bootstrap.sh" -AcceptKey -ErrorAction Stop

    $deployCmd = "chmod +x /tmp/phone-auth-remote-bootstrap.sh && /tmp/phone-auth-remote-bootstrap.sh '$RemoteAppPath' 'mansoni' 'mansoni_app' 'PmkvlEnBRrIdS4MCbV56' '3001'"

    Write-Host "Running remote deploy commands..." -ForegroundColor Yellow
    $result = Invoke-SSHCommand -SSHSession $session -Command $deployCmd -TimeOut 600

    if ($result.ExitStatus -ne 0) {
        Write-Host "Remote deploy failed:" -ForegroundColor Red
        Write-Host $result.Output
        Write-Host $result.Error
        exit 1
    }

    Write-Host "Remote deploy complete." -ForegroundColor Green
    if ($result.Output) {
      Write-Host ($result.Output -join "`n")
    }
}
finally {
    Remove-SSHSession -SSHSession $session | Out-Null
}
