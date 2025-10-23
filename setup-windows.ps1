# Windows Setup Script for Service Translate Capture App

Write-Host "Service Translate - Windows Setup" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "WARNING: Not running as Administrator" -ForegroundColor Yellow
    Write-Host "Some installations may fail. Right-click and 'Run as Administrator' if issues occur." -ForegroundColor Yellow
    Write-Host ""
}

# Check Node.js
Write-Host "Checking for Node.js..." -ForegroundColor Green
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js not found. Please install from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

$nodeVersion = (node --version).TrimStart('v').Split('.')[0]
if ([int]$nodeVersion -lt 18) {
    Write-Host "Node.js version 18 or higher required (found: $(node --version))" -ForegroundColor Red
    exit 1
}
Write-Host "Node.js installed: $(node --version)" -ForegroundColor Green

# Check for Chocolatey
Write-Host ""
Write-Host "Checking for Chocolatey..." -ForegroundColor Green
if (!(Get-Command choco -ErrorAction SilentlyContinue)) {
    Write-Host "Chocolatey not found. Installing..." -ForegroundColor Yellow
    
    try {
        Set-ExecutionPolicy Bypass -Scope Process -Force
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
        Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
        
        Write-Host "Chocolatey installed successfully" -ForegroundColor Green
    } catch {
        Write-Host "Failed to install Chocolatey: $_" -ForegroundColor Red
        Write-Host "Please install manually from https://chocolatey.org/install" -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host "Chocolatey already installed" -ForegroundColor Green
}

# Install sox
Write-Host ""
Write-Host "Installing sox (audio processing tool)..." -ForegroundColor Green

try {
    choco install sox -y
    
    if ($LASTEXITCODE -ne 0) {
        throw "Chocolatey install failed with exit code $LASTEXITCODE"
    }
    
    Write-Host "sox installed successfully" -ForegroundColor Green
} catch {
    Write-Host "Failed to install sox: $_" -ForegroundColor Red
    Write-Host "Please install manually from https://sourceforge.net/projects/sox/" -ForegroundColor Yellow
    #exit 1
}

# Install capture app dependencies
Write-Host ""
Write-Host "Installing capture app dependencies..." -ForegroundColor Green

try {
    npm install
    
    if ($LASTEXITCODE -ne 0) {
        throw "npm install failed with exit code $LASTEXITCODE"
    }
    
    Write-Host "Capture app dependencies installed successfully" -ForegroundColor Green
} catch {
    Write-Host "Failed to install capture app dependencies: $_" -ForegroundColor Red
    exit 1
}

# Install client-pwa dependencies
Write-Host ""
Write-Host "Installing client-pwa dependencies..." -ForegroundColor Green

try {
    Set-Location "../client-pwa"
    npm install
    
    if ($LASTEXITCODE -ne 0) {
        throw "client-pwa npm install failed with exit code $LASTEXITCODE"
    }
    
    Write-Host "Client PWA dependencies installed successfully" -ForegroundColor Green
    Set-Location "../capture"
} catch {
    Write-Host "Failed to install client-pwa dependencies: $_" -ForegroundColor Red
    Set-Location "../capture"
    exit 1
}

# Build TypeScript
Write-Host ""
Write-Host "Building TypeScript..." -ForegroundColor Green

try {
    npm run build
    
    if ($LASTEXITCODE -ne 0) {
        throw "Build failed with exit code $LASTEXITCODE"
    }
    
    Write-Host "Build completed successfully" -ForegroundColor Green
} catch {
    Write-Host "Failed to build TypeScript: $_" -ForegroundColor Red
    exit 1
}

# Configure Windows Firewall
Write-Host ""
Write-Host "Configuring Windows Firewall rules for network access..." -ForegroundColor Green
Write-Host "This requires Administrator privileges to modify firewall settings." -ForegroundColor Yellow
Write-Host ""

# Get configurable ports
$PWA_PORT = if ($env:PWA_PORT) { $env:PWA_PORT } else { "8080" }
$WS_PORT = if ($env:WS_PORT) { $env:WS_PORT } else { "3001" }

Write-Host "Configuring firewall for:" -ForegroundColor Green
Write-Host "  PWA Server: port $PWA_PORT" -ForegroundColor White
Write-Host "  WebSocket Server: port $WS_PORT" -ForegroundColor White
Write-Host ""

if (-not $isAdmin) {
    Write-Host "WARNING: Not running as Administrator - skipping firewall configuration" -ForegroundColor Yellow
    Write-Host "To configure firewall manually, run this script as Administrator or see docs/WINDOWS_FIREWALL_SETUP.md" -ForegroundColor Yellow
} else {
    try {
        # Remove existing rules if they exist (to avoid duplicates)
        Write-Host "Removing existing firewall rules (if any)..." -ForegroundColor Gray
        netsh advfirewall firewall delete rule name="Service Translate - PWA Server*" 2>$null | Out-Null
        netsh advfirewall firewall delete rule name="Service Translate - WebSocket Server*" 2>$null | Out-Null
        
        # Add rule for PWA server (configurable port)
        Write-Host "Adding firewall rule for PWA server (port $PWA_PORT)..." -ForegroundColor Gray
        $result = netsh advfirewall firewall add rule `
            name="Service Translate - PWA Server (TCP $PWA_PORT)" `
            dir=in `
            action=allow `
            protocol=TCP `
            localport=$PWA_PORT `
            profile=private `
            description="Allow incoming connections to Service Translate PWA web server"
        
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to add PWA server firewall rule"
        }
        
        # Add rule for WebSocket server (configurable port)
        Write-Host "Adding firewall rule for WebSocket server (port $WS_PORT)..." -ForegroundColor Gray
        $result = netsh advfirewall firewall add rule `
            name="Service Translate - WebSocket Server (TCP $WS_PORT)" `
            dir=in `
            action=allow `
            protocol=TCP `
            localport=$WS_PORT `
            profile=private `
            description="Allow incoming connections to Service Translate WebSocket server"
        
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to add WebSocket server firewall rule"
        }
        
        Write-Host "Firewall rules configured successfully" -ForegroundColor Green
        Write-Host "  - Port $PWA_PORT: PWA web server" -ForegroundColor White
        Write-Host "  - Port $WS_PORT: WebSocket server" -ForegroundColor White
        Write-Host ""
        Write-Host "Note: Rules are applied to 'Private' network profile only" -ForegroundColor Yellow
        Write-Host "If connecting from other devices doesn't work, ensure your network is set to 'Private'" -ForegroundColor Yellow
        
    } catch {
        Write-Host "Failed to configure Windows Firewall: $_" -ForegroundColor Red
        Write-Host "You may need to configure firewall rules manually" -ForegroundColor Yellow
        Write-Host "See: docs/WINDOWS_FIREWALL_SETUP.md" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "To run the capture app:" -ForegroundColor Cyan
Write-Host "  npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "To start the PWA client server:" -ForegroundColor Cyan
Write-Host "  cd ../client-pwa && npm start" -ForegroundColor White
Write-Host ""
Write-Host "Note: Make sure to configure AWS credentials before running" -ForegroundColor Yellow
Write-Host "  See: ADMIN_AUTHENTICATION_GUIDE.md" -ForegroundColor Yellow
Write-Host ""
