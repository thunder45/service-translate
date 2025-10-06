#!/bin/bash

# Service Translate WebSocket Server Startup Script

echo "Starting Service Translate WebSocket Server..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "Error: npm is not installed. Please install npm first."
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Build the project if dist doesn't exist or src is newer
if [ ! -d "dist" ] || [ "src" -nt "dist" ]; then
    echo "Building project..."
    npm run build
fi

# Create sessions directory if it doesn't exist
mkdir -p sessions

# Start the server
echo "Starting WebSocket server on port ${PORT:-3001}..."
npm start