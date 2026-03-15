#!/usr/bin/env pwsh
# set-sfu-secrets.ps1
# Устанавливает GitHub Secrets для SFU-нод (RU/TR/AE).
# Поскольку все три региона указывают на один сервер (155.212.245.89),
# один набор учётных данных используется для всех трёх.
#
# Использование:
#   pwsh -File scripts/set-sfu-secrets.ps1
#   pwsh -File scripts/set-sfu-secrets.ps1 -KeyFile ~/.ssh/id_rsa
param(
    [string]$SfuHost  = "155.212.245.89",
    [string]$SshPort  = "22",
    [string]$User     = "",
    [string]$KeyFile  = "",
    [string]$Repo     = ""          # например "kmansoni/ECOMANSONI"; если пусто — берётся из git remote
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── helpers ────────────────────────────────────────────────────────────────
function Step([string]$msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Ok([string]$msg)   { Write-Host "    OK: $msg" -ForegroundColor Green }
function Err([string]$msg)  { Write-Host "    ERR: $msg" -ForegroundColor Red; exit 1 }

# ── проверка gh CLI ─────────────────────────────────────────────────────────
Step "Checking gh CLI"
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Err "gh CLI not found. Install from https://cli.github.com/"
}
Ok "gh $(gh --version | Select-String 'gh version' | ForEach-Object { $_.Line })"

# ── repo ────────────────────────────────────────────────────────────────────
if (-not $Repo) {
    $remoteUrl = git remote get-url origin 2>$null
    if ($remoteUrl -match "github\.com[:/](.+?)(?:\.git)?$") {
        $Repo = $Matches[1]
    } else {
        $Repo = Read-Host "GitHub repo (owner/name)"
    }
}
Ok "repo = $Repo"

# ── SSH-пользователь ────────────────────────────────────────────────────────
Step "SSH user"
if (-not $User) {
    $User = Read-Host "SSH username for $SfuHost"
}
if (-not $User) { Err "SSH user is required" }
Ok "user = $User"
Ok "host = $SfuHost"

# ── SSH-ключ ─────────────────────────────────────────────────────────────────
Step "SSH private key"
$keyContent = ""

if ($KeyFile -and (Test-Path $KeyFile)) {
    $keyContent = Get-Content $KeyFile -Raw
    Ok "Loaded key from $KeyFile"
} else {
    # Попробуем стандартные пути
    $candidates = @(
        "$env:USERPROFILE\.ssh\id_ed25519",
        "$env:USERPROFILE\.ssh\id_rsa",
        "$env:HOME/.ssh/id_ed25519",
        "$env:HOME/.ssh/id_rsa"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) {
            $yn = Read-Host "Found key at ${c} -- use it? [Y/n]"
            if ($yn -eq "" -or $yn -match "^[Yy]") {
                $keyContent = Get-Content $c -Raw
                Ok "Loaded key from $c"
                break
            }
        }
    }

    if (-not $keyContent) {
        Write-Host "Paste the private key content (end with an empty line):" -ForegroundColor Yellow
        $lines = @()
        while ($true) {
            $ln = Read-Host
            if ($ln -eq "") { break }
            $lines += $ln
        }
        $keyContent = $lines -join "`n"
    }
}

if (-not $keyContent) { Err "SSH key is required" }

# ── установка секретов ────────────────────────────────────────────────────────
Step "Setting GitHub Secrets for repo $Repo"

$regions = @("RU", "TR", "AE")

foreach ($r in $regions) {
    # HOST
    gh secret set "SFU_${r}_HOST" --body $SfuHost --repo $Repo
    Ok "SFU_${r}_HOST = $SfuHost"

    # SSH_PORT (optional, только если не стандартный)
    if ($SshPort -ne "22") {
        gh secret set "SFU_${r}_SSH_PORT" --body $SshPort --repo $Repo
        Ok "SFU_${r}_SSH_PORT = $SshPort"
    }

    # USER
    gh secret set "SFU_${r}_USER" --body $User --repo $Repo
    Ok "SFU_${r}_USER = $User"

    # SSH_KEY
    $keyContent | gh secret set "SFU_${r}_SSH_KEY" --repo $Repo
    Ok "SFU_${r}_SSH_KEY = (set)"
}

# ── итог ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "All SFU secrets set successfully." -ForegroundColor Green
Write-Host ""
Write-Host "Trigger the deploy workflow with:" -ForegroundColor Cyan
Write-Host "  gh workflow run deploy-calls-sfu.yml --repo $Repo" -ForegroundColor White
Write-Host ""
Write-Host "Monitor with:" -ForegroundColor Cyan
Write-Host "  gh run watch --repo $Repo" -ForegroundColor White
