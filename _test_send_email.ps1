$uri = 'http://155.212.245.89:8090/v1/email/send'
$json = @{
    to = 'mansoni@list.ru'
    subject = 'Test OTP from mansoni.ru'
    html = '<h2>Verification Code</h2><p style="font-size:24px;font-weight:bold;color:#4F46E5">654321</p><p>Sent via email-router on mansoni.ru server</p>'
} | ConvertTo-Json -Compress

$bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
$req = [System.Net.HttpWebRequest]::Create($uri)
$req.Method = 'POST'
$req.ContentType = 'application/json'
$req.Headers.Add('x-ingest-key', $env:EMAIL_ROUTER_INGEST_KEY)
$req.ContentLength = $bytes.Length
$req.Timeout = 10000

$stream = $req.GetRequestStream()
$stream.Write($bytes, 0, $bytes.Length)
$stream.Close()

try {
    $resp = $req.GetResponse()
    $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
    Write-Host "SUCCESS ($([int]$resp.StatusCode)):"
    Write-Host $reader.ReadToEnd()
    $reader.Close()
} catch [System.Net.WebException] {
    $errResp = $_.Exception.Response
    if ($errResp) {
        Write-Host "ERROR $([int]$errResp.StatusCode):"
        $errReader = New-Object System.IO.StreamReader($errResp.GetResponseStream())
        Write-Host $errReader.ReadToEnd()
        $errReader.Close()
        Write-Host "--- Headers ---"
        foreach($key in $errResp.Headers.AllKeys) {
            Write-Host "$key`: $($errResp.Headers[$key])"
        }
    } else {
        Write-Host "Connection error: $($_.Exception.Message)"
    }
}
