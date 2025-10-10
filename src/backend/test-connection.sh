#!/bin/bash

# Test WebSocket connection to AWS API Gateway (Cloud Deployment)
# NOTE: This is for cloud-deployed WebSocket API, not local server
# For local testing, use: src/websocket-server/test-local-connection.sh
#
# Usage: ./test-connection.sh <websocket-url> <token> <device-id>

WS_URL=$1
TOKEN=$2
DEVICE_ID=${3:-"test-device"}

if [ -z "$WS_URL" ] || [ -z "$TOKEN" ]; then
    echo "Usage: ./test-connection.sh <websocket-url> <token> [device-id]"
    echo ""
    echo "NOTE: This is for cloud-deployed WebSocket API"
    echo "For local testing, use: src/websocket-server/test-local-connection.sh"
    echo ""
    echo "Example:"
    echo "  ./test-connection.sh wss://abc123.execute-api.us-east-1.amazonaws.com/prod eyJhbGc..."
    exit 1
fi

# Convert https to wss if needed
WS_URL=${WS_URL/https:\/\//wss://}

# URL encode the Authorization header
AUTH_ENCODED=$(printf "Bearer %s" "$TOKEN" | jq -sRr @uri)

FULL_URL="${WS_URL}?connectionType=admin&deviceId=${DEVICE_ID}&Authorization=${AUTH_ENCODED}"

echo "Testing WebSocket connection..."
echo "URL: ${WS_URL}"
echo ""

# Test with wscat if available
if command -v wscat &> /dev/null; then
    echo "Connecting with wscat..."
    wscat -c "$FULL_URL"
else
    echo "⚠️  wscat not found. Install with: npm install -g wscat"
    echo ""
    echo "Or test manually with this URL:"
    echo "$FULL_URL"
fi
