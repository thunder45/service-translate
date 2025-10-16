# macOS Firewall Configuration for Service Translate

## Overview

Service Translate requires incoming network connections on two ports to function properly when accessed from other devices on the local network:

- **Port 8080**: PWA web server (client-pwa)
- **Port 3001**: WebSocket server

macOS's Packet Filter (pf) firewall may block these incoming connections by default, preventing network access from other devices even though the servers are listening on all interfaces (0.0.0.0).

## Automatic Setup

The `src/capture/setup-macos.sh` script now automatically configures the firewall rules. When you run the setup script, it will:

1. Create firewall rules in `/etc/pf.anchors/service-translate`
2. Update `/etc/pf.conf` to load these rules
3. Reload the firewall configuration
4. Enable the packet filter if not already enabled

```bash
cd src/capture
./setup-macos.sh
```

**Note**: The script requires sudo permissions to modify system firewall settings.

## Manual Setup

If you need to configure the firewall manually, follow these steps:

### Step 1: Create the Anchor Rules File

Create `/etc/pf.anchors/service-translate` with the following content:

```bash
sudo tee /etc/pf.anchors/service-translate > /dev/null << 'EOF'
# Service Translate - Allow incoming connections on ports 8080 and 3001
# Port 8080: PWA web server
# Port 3001: WebSocket server

# Allow TCP traffic on port 8080 (PWA server)
pass in proto tcp from any to any port 8080

# Allow TCP traffic on port 3001 (WebSocket server)
pass in proto tcp from any to any port 3001
EOF
```

### Step 2: Update pf.conf

Add the anchor reference to `/etc/pf.conf`:

```bash
# Backup the current configuration
sudo cp /etc/pf.conf /etc/pf.conf.backup

# Add the anchor load line (insert before other anchors if they exist)
echo 'load anchor "service-translate" from "/etc/pf.anchors/service-translate"' | sudo tee -a /etc/pf.conf
```

### Step 3: Load the Anchor Rules

```bash
# Load the anchor rules directly (recommended approach)
sudo pfctl -a service-translate -f /etc/pf.anchors/service-translate

# Enable pf if not already enabled
sudo pfctl -e
```

**Important**: Do NOT use `sudo pfctl -f /etc/pf.conf` as this tries to reload system-protected rules and will fail with "Resource busy" error. Instead, load only your specific anchor as shown above.

**Note**: The anchor rules are automatically loaded when pf starts (via the reference in pf.conf). The manual load command above is only needed if pf is already running and you want to activate the rules immediately.

## Verification

To verify the firewall rules are active:

```bash
# Check if pf is enabled
sudo pfctl -s info

# View loaded rules
sudo pfctl -s rules | grep -A 2 "service-translate"

# Check anchor rules
sudo pfctl -a service-translate -s rules
```

Expected output should show:
```
pass in proto tcp from any to any port = 8080
pass in proto tcp from any to any port = 3001
```

## Testing Network Access

1. Start both servers:
   ```bash
   # Terminal 1: Start PWA server
   npm run start:pwa

   # Terminal 2: Start WebSocket server
   npm run start:websocket
   ```

2. Find your Mac's local IP address:
   ```bash
   ifconfig | grep "inet " | grep -v 127.0.0.1
   ```

3. From another device on the same network, access:
   - PWA: `http://YOUR_IP:8080`
   - The PWA should automatically connect to the WebSocket server at `http://YOUR_IP:3001`

## Troubleshooting

### Rules Not Taking Effect

If the rules don't seem to be working:

1. Verify pf is enabled:
   ```bash
   sudo pfctl -s info
   ```

2. Check for syntax errors in the anchor file:
   ```bash
   sudo pfctl -n -f /etc/pf.anchors/service-translate
   ```

3. Reload the configuration:
   ```bash
   sudo pfctl -f /etc/pf.conf
   ```

### Temporarily Disable Firewall (Testing Only)

To test if the firewall is the issue:

```bash
# Disable pf temporarily
sudo pfctl -d

# Test your connection
# ...

# Re-enable pf
sudo pfctl -e
```

**WARNING**: Only disable the firewall temporarily for testing. Always re-enable it afterward.

### Remove Service Translate Rules

If you need to remove the firewall rules:

```bash
# Remove the anchor file
sudo rm /etc/pf.anchors/service-translate

# Remove the reference from pf.conf
sudo sed -i.bak '/service-translate/d' /etc/pf.conf

# Reload configuration
sudo pfctl -f /etc/pf.conf
```

## Security Considerations

- The firewall rules allow incoming TCP connections from **any** source IP address on ports 8080 and 3001
- This is appropriate for local network use, where the services are behind your home/office router
- If you need more restrictive rules, you can modify the anchor file to specify source networks:
  ```
  # Only allow from local network (example)
  pass in proto tcp from 192.168.1.0/24 to any port 8080
  pass in proto tcp from 192.168.1.0/24 to any port 3001
  ```

## Additional Resources

- [macOS pf documentation](https://www.openbsd.org/faq/pf/)
- [pf.conf man page](https://man.openbsd.org/pf.conf)
- [pfctl man page](https://man.openbsd.org/pfctl)
