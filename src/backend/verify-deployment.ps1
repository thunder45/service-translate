#!/usr/bin/env pwsh

# Service Translate - Deployment Verification (PowerShell)

Write-Host "Service Translate - Deployment Verification" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

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

# Check AWS CLI
try {
    $awsVersion = aws --version 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "AWS CLI not found"
    }
    Write-Success "AWS CLI installed"
}
catch {
    Write-Error-Custom "AWS CLI not found. Please install it first."
    Write-Host "Download from: https://aws.amazon.com/cli/"
    exit 1
}

# Check Node.js
try {
    $nodeVersion = node --version 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Node.js not found"
    }
    
    $majorVersion = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    if ($majorVersion -lt 18) {
        Write-Error-Custom "Node.js version 18 or higher required (found: $nodeVersion)"
        exit 1
    }
    Write-Success "Node.js installed ($nodeVersion)"
}
catch {
    Write-Error-Custom "Node.js not found. Please install it first."
    Write-Host "Download from: https://nodejs.org/"
    exit 1
}

# Check CDK
try {
    $cdkVersion = cdk --version 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "CDK not found"
    }
    Write-Success "AWS CDK installed ($cdkVersion)"
}
catch {
    Write-Warning-Custom "AWS CDK not found"
    $install = Read-Host "Install AWS CDK globally? (y/N)"
    
    if ($install -match '^[Yy]$') {
        try {
            npm install -g aws-cdk
            if ($LASTEXITCODE -ne 0) {
                throw "Installation failed"
            }
            $cdkVersion = cdk --version
            Write-Success "AWS CDK installed ($cdkVersion)"
        }
        catch {
            Write-Error-Custom "Failed to install AWS CDK"
            exit 1
        }
    }
    else {
        Write-Error-Custom "AWS CDK is required for deployment"
        Write-Host "Install manually: npm install -g aws-cdk"
        exit 1
    }
}

# Check AWS credentials
try {
    aws sts get-caller-identity | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Credentials not configured"
    }
    Write-Success "AWS credentials configured"
}
catch {
    Write-Error-Custom "AWS credentials not configured. Run 'aws configure'"
    exit 1
}

# Check if dependencies are installed
if (-not (Test-Path "node_modules")) {
    Write-Warning-Custom "Dependencies not installed. Run 'npm install'"
    exit 1
}
Write-Success "Dependencies installed"

# Check TypeScript compilation
if (Test-Path "tsconfig.json") {
    try {
        Write-Info "Checking TypeScript compilation..."
        npx tsc --noEmit
        if ($LASTEXITCODE -eq 0) {
            Write-Success "TypeScript compilation successful"
        }
        else {
            Write-Warning-Custom "TypeScript compilation has warnings/errors"
        }
    }
    catch {
        Write-Warning-Custom "TypeScript compilation check failed"
    }
}

# Check CDK synth
Write-Info "Testing CDK synthesis..."
try {
    cdk synth | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Success "CDK synthesis successful"
    }
    else {
        Write-Error-Custom "CDK synthesis failed"
        exit 1
    }
}
catch {
    Write-Error-Custom "CDK synthesis failed"
    Write-Host $_.Exception.Message
    exit 1
}

Write-Host ""
Write-Success "All checks passed!"
Write-Host ""
Write-Info "Ready to deploy! Run: npm run deploy"
Write-Host ""
Write-Host "Available npm scripts:" -ForegroundColor Yellow
Write-Host "  npm run build      - Compile TypeScript"
Write-Host "  npm run watch      - Watch for changes"
Write-Host "  npm run synth      - Synthesize CDK"
Write-Host "  npm run diff       - Show deployment diff"
Write-Host "  npm run deploy     - Deploy to AWS"
Write-Host "  npm run destroy    - Destroy stack (force)"
