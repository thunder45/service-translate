#!/bin/bash

echo "Service Translate - Deployment Verification"
echo "==========================================="
echo ""

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI not found. Please install it first."
    exit 1
fi
echo "✅ AWS CLI installed"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install it first."
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18 or higher required (found: $(node --version))"
    exit 1
fi
echo "✅ Node.js installed ($(node --version))"

# Check CDK
if ! command -v cdk &> /dev/null; then
    echo "⚠️  AWS CDK not found"
    read -p "Install AWS CDK globally? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        npm install -g aws-cdk
        if [ $? -ne 0 ]; then
            echo "❌ Failed to install AWS CDK"
            exit 1
        fi
    else
        echo "❌ AWS CDK is required for deployment"
        echo "Install manually: npm install -g aws-cdk"
        exit 1
    fi
fi

CDK_VERSION=$(cdk --version | cut -d' ' -f1)
echo "✅ AWS CDK installed ($CDK_VERSION)"

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured. Run 'aws configure'"
    exit 1
fi
echo "✅ AWS credentials configured"

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "⚠️  Dependencies not installed. Run 'npm install'"
    exit 1
fi
echo "✅ Dependencies installed"

echo ""
echo "✅ All checks passed!"
echo ""
echo "Ready to deploy! Run: npm run deploy"
