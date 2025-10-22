#!/usr/bin/env pwsh

# Test WebSocket connection to AWS API Gateway (Cloud Deployment)
# NOTE: This is for cloud-deployed WebSocket API, not local server
# For local testing, use: src/websocket-server/test-local-connection.sh
#
# Usage: .\test-connection.ps1 <websocket-url> <token> [device-id]

param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$WsUrl,
    
    [Parameter(Mandatory=$true, Position=1)]
    [string]$Token,
    
    [Parameter(Position=2)]
    [string]$DeviceId = "test-device"
)

# Color output functions
function Write-Error-Custom {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message" -ForegroundColor Cyan
}

function Write-Warning-Custom {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

if (-not $WsUrl -or -not $Token) {
    Write-Host @"
Usage: .\test-connection.ps1 <websocket-url> <token> [device-id]

NOTE: This is for cloud-deployed WebSocket API
For local testing, use: src/websocket-server/test-local-connection.sh

Example:
  .\test-connection.ps1 wss://abc123.execute-api.us-east-1.amazonaws.com/prod eyJhbGc...

"@
    exit 1
}

Write-Info "Testing WebSocket connection..."

# Convert https to wss if needed
$WsUrl = $WsUrl -replace "^https://", "wss://"

Write-Host "URL: $WsUrl"
Write-Host ""

# URL encode the Authorization header
$AuthValue = "Bearer $Token"
$AuthEncoded = [System.Web.HttpUtility]::UrlEncode($AuthValue)

$FullUrl = "${WsUrl}?connectionType=admin&deviceId=${DeviceId}&Authorization=${AuthEncoded}"

# Check if wscat is available
try {
    $wscatVersion = wscat --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Info "Connecting with wscat..."
        Write-Host ""
        Write-Host "Full URL: $FullUrl"
        Write-Host ""
        Write-Info "Press Ctrl+C to disconnect"
        & wscat -c $FullUrl
    }
}
catch {
    Write-Warning-Custom "wscat not found. Install with: npm install -g wscat"
    Write-Host ""
    Write-Info "Or test manually with this URL:"
    Write-Host $FullUrl
    Write-Host ""
    Write-Info "You can use online WebSocket testing tools or browser console:"
    Write-Host "const ws = new WebSocket('$FullUrl');"
    Write-Host "ws.onopen = () => console.log('Connected');"
    Write-Host "ws.onmessage = (event) => console.log('Message:', event.data);"
    Write-Host "ws.onerror = (error) => console.log('Error:', error);"
}
