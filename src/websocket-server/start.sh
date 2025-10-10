#!/bin/bash

# Service Translate WebSocket Server Startup Script

echo "Starting Service Translate WebSocket Server..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install || {
        echo "❌ Failed to install dependencies"
        exit 1
    }
fi

# Build the project if dist doesn't exist or needs rebuild
if [ ! -d "dist" ]; then
    echo "Building project..."
    npm run build || {
        echo "❌ Build failed"
        exit 1
    }
else
    # Check if any TypeScript file is newer than dist
    if [ -n "$(find src -name '*.ts' -newer dist 2>/dev/null)" ]; then
        echo "Source files changed, rebuilding..."
        npm run build || {
            echo "❌ Build failed"
            exit 1
        }
    fi
fi

# Create required directories
mkdir -p sessions admin-identities logs

# Start the server
echo "Starting WebSocket server on port ${PORT:-3001}..."
npm start
