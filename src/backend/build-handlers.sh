#!/bin/bash

echo "Building Lambda handlers..."

cd lambdas/handlers

# Create package.json if not exists
if [ ! -f "package.json" ]; then
    cat > package.json << 'EOF'
{
  "name": "handlers",
  "version": "1.0.0",
  "dependencies": {
    "@aws-sdk/client-apigatewaymanagementapi": "^3.0.0",
    "@aws-sdk/client-dynamodb": "^3.0.0",
    "@aws-sdk/client-translate": "^3.0.0",
    "@aws-sdk/lib-dynamodb": "^3.0.0",
    "aws-jwt-verify": "^4.0.0",
    "qrcode": "^1.5.0"
  }
}
EOF
fi

# Install dependencies
npm install

# Compile TypeScript
npx tsc --target ES2020 --module commonjs --esModuleInterop --skipLibCheck *.ts

echo "✅ Handlers built successfully"
