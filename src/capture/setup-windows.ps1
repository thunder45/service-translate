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
    exit 1
}

# Install Node.js dependencies
Write-Host ""
Write-Host "Installing Node.js dependencies..." -ForegroundColor Green

try {
    npm install
    
    if ($LASTEXITCODE -ne 0) {
        throw "npm install failed with exit code $LASTEXITCODE"
    }
    
    Write-Host "Dependencies installed successfully" -ForegroundColor Green
} catch {
    Write-Host "Failed to install Node.js dependencies: $_" -ForegroundColor Red
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

Write-Host ""
Write-Host "Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "To run the application:" -ForegroundColor Cyan
Write-Host "  npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "Note: Make sure to configure AWS credentials before running" -ForegroundColor Yellow
Write-Host "  See: ADMIN_AUTHENTICATION_GUIDE.md" -ForegroundColor Yellow
Write-Host ""
