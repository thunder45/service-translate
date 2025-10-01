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
echo "✅ Node.js installed ($(node --version))"

# Check CDK
if ! command -v cdk &> /dev/null; then
    echo "❌ AWS CDK not found. Installing..."
    npm install -g aws-cdk
fi
echo "✅ AWS CDK installed ($(cdk --version))"

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
echo "Ready to deploy! Run: npm run deploy"
