#!/bin/bash

echo "Service Translate - macOS Capture Setup"
echo "========================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install it first."
    exit 1
fi
echo "✅ Node.js installed ($(node --version))"

# Check SoX
if ! command -v sox &> /dev/null; then
    echo "⚠️  SoX not found. Installing via Homebrew..."
    if command -v brew &> /dev/null; then
        brew install sox
    else
        echo "❌ Homebrew not found. Install SoX manually: brew install sox"
        exit 1
    fi
fi
echo "✅ SoX installed ($(sox --version | head -1))"

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install

echo ""
echo "✅ Setup complete!"
echo ""
echo "To run the app:"
echo "  npm run dev"
