# Service Translate WebSocket Server Startup Script (Windows)

Write-Host "Starting Service Translate WebSocket Server..." -ForegroundColor Cyan

# Check if Node.js is installed
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js is not installed. Please install Node.js first." -ForegroundColor Red
    exit 1
}

# Check if npm is installed
if (!(Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "npm is not installed. Please install npm first." -ForegroundColor Red
    exit 1
}

# Install dependencies if node_modules doesn't exist
if (!(Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install dependencies" -ForegroundColor Red
        exit 1
    }
}

# Build the project if dist doesn't exist or needs rebuild
if (!(Test-Path "dist")) {
    Write-Host "Building project..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Build failed" -ForegroundColor Red
        exit 1
    }
} else {
    # Check if any TypeScript file is newer than dist
    $tsFiles = Get-ChildItem -Path "src" -Filter "*.ts" -Recurse -ErrorAction SilentlyContinue
    $distModified = (Get-Item "dist" -ErrorAction SilentlyContinue).LastWriteTime
    
    $needsRebuild = $false
    foreach ($file in $tsFiles) {
        if ($file.LastWriteTime -gt $distModified) {
            $needsRebuild = $true
            break
        }
    }
    
    if ($needsRebuild) {
        Write-Host "Source files changed, rebuilding..." -ForegroundColor Yellow
        npm run build
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Build failed" -ForegroundColor Red
            exit 1
        }
    }
}

# Create required directories
@('sessions', 'admin-identities', 'logs') | ForEach-Object {
    if (!(Test-Path $_)) {
        New-Item -ItemType Directory -Path $_ | Out-Null
    }
}

# Get port from environment or default to 3001
$port = if ($env:PORT) { $env:PORT } else { "3001" }

# Start the server
Write-Host "Starting WebSocket server on port $port..." -ForegroundColor Green
npm start
