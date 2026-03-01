param(
  [string]$BaseUrl = "http://127.0.0.1:8090",
  [string]$Mailbox = "support@example.com",
  [string]$From = "customer@example.com",
  [string]$OutboundTo = "user@example.com",
  [string]$IngestKey,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Get-Headers {
  $headers = @{ "Content-Type" = "application/json" }
  if (-not [string]::IsNullOrWhiteSpace($IngestKey)) {
    $headers["x-ingest-key"] = $IngestKey
  }
  return $headers
}

function Invoke-Step {
  param(
    [Parameter(Mandatory=$true)][string]$Name,
    [Parameter(Mandatory=$true)][string]$Method,
    [Parameter(Mandatory=$true)][string]$Path,
    [object]$Body
  )

  $url = "$BaseUrl$Path"
  Write-Host "`n==> $Name" -ForegroundColor Cyan
  Write-Host "$Method $url" -ForegroundColor DarkGray

  if ($Body) {
    $json = $Body | ConvertTo-Json -Depth 20
    Write-Host $json -ForegroundColor DarkGray
  }

  if ($DryRun) {
    return $null
  }

  $params = @{
    Method  = $Method
    Uri     = $url
    Headers = Get-Headers
  }
  if ($Body) {
    $params.Body = ($Body | ConvertTo-Json -Depth 20)
  }

  $response = Invoke-RestMethod @params
  if ($null -ne $response) {
    Write-Host ("<== " + ($response | ConvertTo-Json -Depth 20)) -ForegroundColor Green
  }
  return $response
}

$messageId = "<smoke-$(Get-Date -Format 'yyyyMMddHHmmss')@example.com>"
$subject = "Smoke thread $(Get-Date -Format s)"

Write-Host "Email Router smoke flow" -ForegroundColor Yellow
Write-Host "BaseUrl=$BaseUrl Mailbox=$Mailbox DryRun=$DryRun" -ForegroundColor Yellow

Invoke-Step -Name "Health" -Method "GET" -Path "/health"

$sendRes = Invoke-Step -Name "Send outbound" -Method "POST" -Path "/v1/email/send" -Body @{
  to = $OutboundTo
  subject = "Smoke outbound"
  text = "Outbound smoke check"
  idempotencyKey = "smoke-send-$(Get-Date -Format 'yyyyMMddHHmmss')"
}

$inboundRes = Invoke-Step -Name "Ingest inbound" -Method "POST" -Path "/v1/email/inbound" -Body @{
  messageId = $messageId
  from = $From
  to = @($Mailbox)
  subject = $subject
  text = "Inbound smoke check"
  html = "<p>Inbound smoke check</p>"
  provider = "smoke"
  receivedAt = (Get-Date).ToUniversalTime().ToString("o")
}

$inbox = Invoke-Step -Name "List inbox unread" -Method "GET" -Path "/v1/email/inbox?to=$([uri]::EscapeDataString($Mailbox))&limit=20&unreadOnly=true"

$threads = Invoke-Step -Name "List threads unread" -Method "GET" -Path "/v1/email/threads?to=$([uri]::EscapeDataString($Mailbox))&limit=20&unreadOnly=true"

$threadId = $null
if (-not $DryRun -and $threads -and $threads.items -and $threads.items.Count -gt 0) {
  $threadId = $threads.items[0].id
}

if ($threadId) {
  $history = Invoke-Step -Name "Thread messages" -Method "GET" -Path "/v1/email/threads/$threadId/messages?limit=50"

  Invoke-Step -Name "Reply in thread" -Method "POST" -Path "/v1/email/threads/$threadId/reply" -Body @{
    text = "Smoke reply"
    html = "<p>Smoke reply</p>"
    from = $Mailbox
    idempotencyKey = "smoke-reply-$(Get-Date -Format 'yyyyMMddHHmmss')"
  }

  $inboxItemId = $null
  if ($history -and $history.inbox -and $history.inbox.Count -gt 0) {
    $inboxItemId = $history.inbox[-1].id
  }

  if ($inboxItemId) {
    Invoke-Step -Name "Mark inbox read" -Method "POST" -Path "/v1/email/inbox/$inboxItemId/read" -Body @{
      read = $true
    }
  } else {
    Write-Host "No inbox item found in thread to mark as read." -ForegroundColor Yellow
  }
} elseif (-not $DryRun) {
  Write-Host "No thread found for mailbox. Check ingest key and mailbox address." -ForegroundColor Yellow
}

Write-Host "`nSmoke flow finished." -ForegroundColor Cyan