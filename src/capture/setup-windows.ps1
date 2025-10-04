# Windows Setup Script for Service Translate Capture App

Write-Host "Service Translate - Windows Setup" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "Warning: Not running as Administrator. Some installations may fail." -ForegroundColor Yellow
    Write-Host ""
}

# Check for Chocolatey
Write-Host "Checking for Chocolatey..." -ForegroundColor Green
if (!(Get-Command choco -ErrorAction SilentlyContinue)) {
    Write-Host "Chocolatey not found. Installing..." -ForegroundColor Yellow
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install Chocolatey. Please install manually from https://chocolatey.org/install" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "Chocolatey already installed" -ForegroundColor Green
}

# Install sox
Write-Host ""
Write-Host "Installing sox (audio processing tool)..." -ForegroundColor Green
choco install sox -y

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to install sox. Please install manually from https://sourceforge.net/projects/sox/" -ForegroundColor Red
    exit 1
}

# Install Node.js dependencies
Write-Host ""
Write-Host "Installing Node.js dependencies..." -ForegroundColor Green
npm install

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to install Node.js dependencies" -ForegroundColor Red
    exit 1
}

# Build TypeScript
Write-Host ""
Write-Host "Building TypeScript..." -ForegroundColor Green
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to build TypeScript" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "To run the application:" -ForegroundColor Cyan
Write-Host "  npm run dev" -ForegroundColor White
Write-Host ""
