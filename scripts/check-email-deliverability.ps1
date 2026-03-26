# =============================================================================
# Email Deliverability Diagnostic Script
# Checks DNS, PTR, SPF, DKIM, DMARC, and blacklists for mansoni.ru
# Usage: pwsh -NoProfile -ExecutionPolicy Bypass -File ./scripts/check-email-deliverability.ps1
# =============================================================================

param(
    [string]$SendingIp   = "155.212.245.89",
    [string]$Domain      = "mansoni.ru",
    [string]$DkimSelector= "mail"
)

$ErrorActionPreference = "Continue"
$pass  = "[PASS]"
$fail  = "[FAIL]"
$warn  = "[WARN]"
$info  = "[INFO]"

function Write-Check([string]$label, [bool]$ok, [string]$detail) {
    $icon = if ($ok) { $pass } else { $fail }
    $color = if ($ok) { "Green" } else { "Red" }
    Write-Host "$icon $label" -ForegroundColor $color
    if ($detail) { Write-Host "       $detail" -ForegroundColor Gray }
}

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host " Email Deliverability Audit: $Domain / $SendingIp" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""

# Helper: reverse IP for rDNS lookup
function Reverse-IP([string]$ip) {
    return ($ip -split "\." | Select-Object -Last 4 | Sort-Object -Descending) -join "."
}

$reversedIp = Reverse-IP $SendingIp

# ── 1. PTR Record (Reverse DNS) ──────────────────────────────────────────────
Write-Host "1. PTR Record (Reverse DNS)" -ForegroundColor Yellow
try {
    $ptr = Resolve-DnsName -Name "$reversedIp.in-addr.arpa" -Type PTR -ErrorAction Stop |
           Select-Object -ExpandProperty NameHost -First 1
    $ptrOk = ($ptr -ne $null -and $ptr.Length -gt 0)
    Write-Check "PTR exists" $ptrOk "$SendingIp -> $ptr"

    if ($ptrOk) {
        # FCrDNS: forward confirmation
        $fwd = Resolve-DnsName -Name $ptr -Type A -ErrorAction Stop |
               Select-Object -ExpandProperty IPAddress -First 1
        $fcrdnsOk = ($fwd -eq $SendingIp)
        Write-Check "FCrDNS match (PTR->A = sending IP)" $fcrdnsOk "$ptr -> $fwd (expected $SendingIp)"
    }
} catch {
    Write-Check "PTR exists" $false "ERROR: $_"
}

Write-Host ""

# ── 2. SPF Record ─────────────────────────────────────────────────────────────
Write-Host "2. SPF Record" -ForegroundColor Yellow
try {
    $spfRecords = Resolve-DnsName -Name $Domain -Type TXT -ErrorAction Stop |
                  Where-Object { $_.Strings -match "v=spf1" } |
                  Select-Object -ExpandProperty Strings
    $spfOk = ($spfRecords -ne $null)
    $spfStr = ($spfRecords | Out-String).Trim()
    Write-Check "SPF record exists" $spfOk $spfStr

    if ($spfOk) {
        $ipInSpf = $spfStr -match [regex]::Escape("ip4:$SendingIp")
        Write-Check "Sending IP ($SendingIp) included in SPF" $ipInSpf ""
        $noDoubleAll = ($spfStr -notmatch "-all.*-all")
        $softOrNeutral = $spfStr -match "~all|[?]all|-all"
        Write-Check "SPF ends with ~all or -all" $softOrNeutral ""
    }
} catch {
    Write-Check "SPF record exists" $false "ERROR: $_"
}

Write-Host ""

# ── 3. DKIM Record ────────────────────────────────────────────────────────────
Write-Host "3. DKIM Record (selector: $DkimSelector)" -ForegroundColor Yellow
try {
    $dkimName = "$DkimSelector._domainkey.$Domain"
    $dkimRecords = Resolve-DnsName -Name $dkimName -Type TXT -ErrorAction Stop |
                   Select-Object -ExpandProperty Strings
    $dkimOk = ($dkimRecords -ne $null -and ($dkimRecords | Out-String) -match "v=DKIM1")
    $dkimStr = ($dkimRecords | Out-String).Trim().Substring(0, [Math]::Min(120, ($dkimRecords | Out-String).Trim().Length))
    Write-Check "DKIM record at $dkimName" $dkimOk "$dkimStr..."

    if ($dkimOk) {
        $hasKey = ($dkimRecords | Out-String) -match "p=[A-Za-z0-9+/=]{20,}"
        Write-Check "DKIM public key present (p= not empty)" $hasKey ""
    }
} catch {
    Write-Check "DKIM record at $DkimSelector._domainkey.$Domain" $false "ERROR: $_. Run: opendkim-genkey -s $DkimSelector -d $Domain -b 2048"
}

Write-Host ""

# ── 4. DMARC Record ───────────────────────────────────────────────────────────
Write-Host "4. DMARC Record" -ForegroundColor Yellow
try {
    $dmarcRecords = Resolve-DnsName -Name "_dmarc.$Domain" -Type TXT -ErrorAction Stop |
                    Select-Object -ExpandProperty Strings
    $dmarcOk = ($dmarcRecords -ne $null -and ($dmarcRecords | Out-String) -match "v=DMARC1")
    $dmarcStr = ($dmarcRecords | Out-String).Trim()
    Write-Check "DMARC record at _dmarc.$Domain" $dmarcOk $dmarcStr

    if ($dmarcOk) {
        $policy = if ($dmarcStr -match "p=(none|quarantine|reject)") { $Matches[1] } else { "none" }
        $policyOk = ($policy -eq "reject" -or $policy -eq "quarantine")
        Write-Check "DMARC policy is quarantine or reject (current: $policy)" $policyOk "For new domains start with p=none, then escalate"
        $hasRua = $dmarcStr -match "rua=mailto:"
        Write-Check "DMARC aggregate reports (rua=) configured" $hasRua ""
    }
} catch {
    Write-Check "DMARC record" $false "ERROR: $_. Add: _dmarc.$Domain IN TXT `"v=DMARC1; p=none; rua=mailto:dmarc@$Domain`""
}

Write-Host ""

# ── 5. MX Record ──────────────────────────────────────────────────────────────
Write-Host "5. MX Record" -ForegroundColor Yellow
try {
    $mx = Resolve-DnsName -Name $Domain -Type MX -ErrorAction Stop |
          Sort-Object Preference | Select-Object -First 1
    $mxOk = ($mx -ne $null)
    Write-Check "MX record exists" $mxOk "Priority $($mx.Preference) -> $($mx.NameExchange)"
} catch {
    Write-Check "MX record exists" $false "ERROR: $_"
}

Write-Host ""

# ── 6. Blacklist Checks ───────────────────────────────────────────────────────
Write-Host "6. Blacklist Checks" -ForegroundColor Yellow

$blacklists = @(
    "zen.spamhaus.org",       # Spamhaus ZEN (SBL+XBL+PBL combined)
    "bl.spamcop.net",         # SpamCop
    "b.barracudacentral.org", # Barracuda
    "dnsbl.sorbs.net",        # SORBS
    "dnsbl-1.uceprotect.net"  # UCEPROTECT Level 1
)

foreach ($bl in $blacklists) {
    $lookupName = "$reversedIp.$bl"
    try {
        $result = Resolve-DnsName -Name $lookupName -Type A -ErrorAction Stop |
                  Select-Object -ExpandProperty IPAddress -First 1
        if ($result) {
            Write-Check "NOT listed in $bl" $false "LISTED: $result — Submit delisting request"
        } else {
            Write-Check "NOT listed in $bl" $true ""
        }
    } catch {
        # NXDOMAIN = not listed (good)
        $isNxDomain = $_.Exception.Message -match "NXDOMAIN|DNS name does not exist|No such host"
        if ($isNxDomain) {
            Write-Check "NOT listed in $bl" $true "NXDOMAIN = clean"
        } else {
            Write-Host "$warn  $bl check error: $_" -ForegroundColor Yellow
        }
    }
}

Write-Host ""

# ── 7. SMTP Connectivity ──────────────────────────────────────────────────────
Write-Host "7. SMTP Connectivity" -ForegroundColor Yellow
$smtpPorts = @(25, 587, 465)
foreach ($port in $smtpPorts) {
    try {
        $tcp = [System.Net.Sockets.TcpClient]::new()
        $connectTask = $tcp.ConnectAsync($Domain, $port)
        $connected = $connectTask.Wait(3000)
        $tcp.Close()
        Write-Check "SMTP port $port reachable on $Domain" $connected ""
    } catch {
        Write-Check "SMTP port $port reachable on $Domain" $false "$_"
    }
}

Write-Host ""
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host " Next steps for issues found above:" -ForegroundColor Cyan
Write-Host "  PTR:   Set in VPS control panel (Selectel/Timeweb -> IP -> PTR)" -ForegroundColor Gray
Write-Host "  SPF:   Add TXT to DNS: v=spf1 ip4:$SendingIp mx ~all" -ForegroundColor Gray
Write-Host "  DKIM:  Run: opendkim-genkey -s $DkimSelector -d $Domain -b 2048" -ForegroundColor Gray
Write-Host "  DMARC: Add TXT: _dmarc.$Domain -> v=DMARC1; p=none; rua=mailto:dmarc@$Domain" -ForegroundColor Gray
Write-Host "  BL:    Submit delisting: https://mxtoolbox.com/blacklists.aspx" -ForegroundColor Gray
Write-Host "  Tools: https://postmaster.google.com  https://postmaster.apple.com" -ForegroundColor Gray
Write-Host "=================================================================" -ForegroundColor Cyan
