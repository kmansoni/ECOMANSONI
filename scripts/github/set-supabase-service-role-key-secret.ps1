param(
  [Parameter(Mandatory = $false)]
  [string]$Repo = "kmansoni/ECOMANSONI",

  [Parameter(Mandatory = $false)]
  [string]$SecretName = "SUPABASE_SERVICE_ROLE_KEY"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$secure = Read-Host "Enter $SecretName (input hidden)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)

try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  if ([string]::IsNullOrWhiteSpace($plain)) {
    throw "Empty secret provided."
  }

  $gh = Get-Command gh -ErrorAction Stop

  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $gh.Source
  $psi.Arguments = "secret set $SecretName -R $Repo"
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true

  $p = [System.Diagnostics.Process]::new()
  $p.StartInfo = $psi
  if (-not $p.Start()) {
    throw "Failed to start gh process."
  }

  try {
    # gh reads secret value from stdin when --body is not specified.
    # Avoid adding a trailing newline; keep the JWT intact.
    $p.StandardInput.Write($plain)
    $p.StandardInput.Close()

    $stdout = $p.StandardOutput.ReadToEnd()
    $stderr = $p.StandardError.ReadToEnd()
    $p.WaitForExit()

    if ($p.ExitCode -ne 0) {
      throw "gh failed (exit=$($p.ExitCode)). $stderr"
    }

    if ($stdout) { Write-Host $stdout }
  }
  finally {
    if (-not $p.HasExited) { $p.Kill() | Out-Null }
    $p.Dispose()
  }
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  Remove-Variable -Name plain -ErrorAction SilentlyContinue
}
