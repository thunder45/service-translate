#!/bin/bash

echo "=== TTS Server Configuration Setup ==="
echo ""

# Check if .env exists
if [ -f .env ]; then
    echo "⚠️  .env file already exists"
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Setup cancelled"
        exit 0
    fi
fi

# Copy example
cp .env.example .env

echo "✅ Created .env file from template"
echo ""
echo "Choose TTS configuration:"
echo "1) Disabled (text-only, no AWS costs)"
echo "2) Enabled (requires AWS credentials)"
read -p "Enter choice (1 or 2): " choice

if [ "$choice" = "1" ]; then
    sed -i '' 's/ENABLE_TTS=false/ENABLE_TTS=false/' .env
    echo "✅ TTS disabled - clients will use local TTS or text-only"
elif [ "$choice" = "2" ]; then
    sed -i '' 's/ENABLE_TTS=false/ENABLE_TTS=true/' .env
    echo ""
    echo "Enter AWS credentials (from capture app or AWS console):"
    read -p "AWS Region [us-east-1]: " region
    region=${region:-us-east-1}
    
    read -p "Identity Pool ID: " identity_pool
    read -p "User Pool ID: " user_pool
    read -p "JWT Token (optional, press Enter to skip): " jwt_token
    
    sed -i '' "s|AWS_REGION=us-east-1|AWS_REGION=$region|" .env
    sed -i '' "s|AWS_IDENTITY_POOL_ID=|AWS_IDENTITY_POOL_ID=$identity_pool|" .env
    sed -i '' "s|AWS_USER_POOL_ID=|AWS_USER_POOL_ID=$user_pool|" .env
    
    if [ -n "$jwt_token" ]; then
        sed -i '' "s|AWS_JWT_TOKEN=|AWS_JWT_TOKEN=$jwt_token|" .env
    fi
    
    echo "✅ TTS enabled with AWS Polly"
else
    echo "Invalid choice"
    exit 1
fi

echo ""
echo "✅ Configuration complete!"
echo ""
echo "Next steps:"
echo "1. Review .env file: nano .env"
echo "2. Install dependencies: npm install"
echo "3. Start server: npm start"
