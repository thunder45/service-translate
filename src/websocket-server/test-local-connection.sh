#!/bin/bash

# Test Local WebSocket Server Connection
# Usage: ./test-local-connection.sh [host] [port]

HOST=${1:-localhost}
PORT=${2:-3001}
WS_URL="ws://${HOST}:${PORT}"

echo "Testing Local WebSocket Server Connection"
echo "=========================================="
echo "URL: $WS_URL"
echo ""

# Check if server is running
if ! nc -z "$HOST" "$PORT" 2>/dev/null; then
    echo "❌ Server is not running on ${HOST}:${PORT}"
    echo ""
    echo "Start the server first:"
    echo "  cd src/websocket-server && npm start"
    exit 1
fi

echo "✅ Server is running on ${HOST}:${PORT}"
echo ""

# Test with wscat if available
if command -v wscat &> /dev/null; then
    echo "Connecting with wscat..."
    echo "After connection, you can send messages like:"
    echo '  {"type":"admin-auth","method":"credentials","username":"user@example.com","password":"YourPassword"}'
    echo ""
    wscat -c "$WS_URL"
else
    echo "⚠️  wscat not found. Install with: npm install -g wscat"
    echo ""
    echo "Or use this Node.js test script:"
    cat << 'EOF'

const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3001');

ws.on('open', () => {
  console.log('✅ Connected to WebSocket server');
  
  // Send admin auth message
  ws.send(JSON.stringify({
    type: 'admin-auth',
    method: 'credentials',
    username: 'your-email@example.com',
    password: 'YourPassword'
  }));
});

ws.on('message', (data) => {
  console.log('Received:', data.toString());
});

ws.on('error', (error) => {
  console.error('❌ Error:', error.message);
});

EOF
fi
