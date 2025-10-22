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

# Configure macOS Packet Filter firewall
echo ""
echo "Configuring firewall rules for network access..."
echo "This requires sudo permissions to modify system firewall settings."
echo ""

# Get configurable ports
PWA_PORT=${PWA_PORT:-8080}
WS_PORT=${PORT:-3001}

echo "Configuring firewall for:"
echo "  PWA Server: port ${PWA_PORT}"
echo "  WebSocket Server: port ${WS_PORT}"
echo ""

# Create the anchor rules file
ANCHOR_FILE="/etc/pf.anchors/service-translate"
sudo tee "$ANCHOR_FILE" > /dev/null << EOF
# Service Translate - Allow incoming connections on PWA and WebSocket ports
# Port ${PWA_PORT}: PWA web server (configurable via PWA_PORT environment variable)
# Port ${WS_PORT}: WebSocket server (configurable via PORT environment variable)

# Allow TCP traffic on PWA server port
pass in proto tcp from any to any port ${PWA_PORT}

# Allow TCP traffic on WebSocket server port
pass in proto tcp from any to any port ${WS_PORT}
EOF

if [ $? -eq 0 ]; then
    echo "✅ Created firewall anchor rules at $ANCHOR_FILE"
else
    echo "❌ Failed to create firewall anchor rules"
    exit 1
fi

# Check if anchor is already loaded in pf.conf
if ! sudo grep -q "service-translate" /etc/pf.conf; then
    echo "Adding anchor reference to /etc/pf.conf..."
    
    # Backup pf.conf
    sudo cp /etc/pf.conf /etc/pf.conf.backup.$(date +%Y%m%d_%H%M%S)
    
    # Add the anchor load line before the first anchor line or at the end
    if sudo grep -q "^anchor" /etc/pf.conf; then
        # Insert before first anchor line
        sudo sed -i.tmp '/^anchor/i\
load anchor "service-translate" from "/etc/pf.anchors/service-translate"
' /etc/pf.conf
        sudo rm /etc/pf.conf.tmp
    else
        # Append at the end
        echo 'load anchor "service-translate" from "/etc/pf.anchors/service-translate"' | sudo tee -a /etc/pf.conf > /dev/null
    fi
    
    echo "✅ Added anchor reference to pf.conf"
else
    echo "✅ Anchor reference already exists in pf.conf"
fi

# Apply firewall configuration
echo "Applying firewall rules..."

# Check if pf is currently enabled
if sudo pfctl -s info 2>/dev/null | grep -q "Status: Enabled"; then
    echo "Packet filter is enabled"
    
    # Reload just our anchor without touching system rules
    echo "Loading service-translate anchor rules..."
    sudo pfctl -a service-translate -f /etc/pf.anchors/service-translate 2>/dev/null
    if [ $? -eq 0 ]; then
        echo "✅ Anchor rules loaded successfully"
    else
        echo "⚠️  Anchor rules may already be loaded (this is normal)"
    fi
else
    echo "Packet filter is disabled"
    echo "Enabling packet filter (this will load all rules including our anchor)..."
    sudo pfctl -e -f /etc/pf.conf 2>/dev/null
    if [ $? -eq 0 ]; then
        echo "✅ Packet filter enabled with new rules"
    else
        # Fallback: try enabling without reload
        sudo pfctl -e 2>/dev/null
        if [ $? -eq 0 ]; then
            echo "✅ Packet filter enabled"
            # Then load our anchor
            sudo pfctl -a service-translate -f /etc/pf.anchors/service-translate 2>/dev/null
            echo "✅ Anchor rules loaded"
        else
            echo "⚠️  Could not enable packet filter"
            echo "ℹ️  Your system may not use pf for firewalling"
            echo "ℹ️  Try accessing the service via IP - it may work without pf changes"
        fi
    fi
fi

echo "✅ Firewall configured to allow ports ${PWA_PORT} and ${WS_PORT}"

# Install capture app dependencies
echo ""
echo "Installing capture app dependencies..."
npm install

# Install client-pwa dependencies
echo ""
echo "Installing client-pwa dependencies..."
cd ../client-pwa
npm install
echo "✅ Client PWA dependencies installed"
cd ../capture

echo ""
echo "✅ Setup complete!"
echo ""
echo "To run the capture app:"
echo "  npm run dev"
echo ""
echo "To start the PWA client server:"
echo "  cd ../client-pwa && npm start"
