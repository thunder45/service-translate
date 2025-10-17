# Windows Firewall Configuration for Service Translate

## Overview

Service Translate requires incoming network connections on two ports to function properly when accessed from other devices on the local network:

- **Port 8080**: PWA web server (client-pwa)
- **Port 3001**: WebSocket server

Windows Firewall may block these incoming connections by default, preventing network access from other devices even though the servers are listening on all interfaces (0.0.0.0).

## Automatic Setup (Recommended)

The `src/capture/setup-windows.ps1` script automatically configures the firewall rules when run as Administrator.

### Steps:

1. Right-click on PowerShell and select "Run as Administrator"
2. Navigate to the capture directory:
   ```powershell
   cd src/capture
   ```
3. Run the setup script:
   ```powershell
   .\setup-windows.ps1
   ```

The script will:
- Create firewall rules for ports 8080 and 3001
- Apply rules to the "Private" network profile
- Remove any existing rules to avoid duplicates

**Note**: The script requires Administrator privileges to modify firewall settings.

## Manual Setup

If you need to configure the firewall manually, follow these steps:

### Method 1: Using PowerShell (Recommended)

Run PowerShell as Administrator and execute:

```powershell
# Add rule for PWA server (port 8080)
netsh advfirewall firewall add rule `
    name="Service Translate - PWA Server (TCP 8080)" `
    dir=in `
    action=allow `
    protocol=TCP `
    localport=8080 `
    profile=private `
    description="Allow incoming connections to Service Translate PWA web server"

# Add rule for WebSocket server (port 3001)
netsh advfirewall firewall add rule `
    name="Service Translate - WebSocket Server (TCP 3001)" `
    dir=in `
    action=allow `
    protocol=TCP `
    localport=3001 `
    profile=private `
    description="Allow incoming connections to Service Translate WebSocket server"
```

### Method 2: Using Windows Defender Firewall GUI

1. **Open Windows Defender Firewall**:
   - Press `Win + R`
   - Type `wf.msc` and press Enter

2. **Create Rule for Port 8080**:
   - Click "Inbound Rules" in the left panel
   - Click "New Rule..." in the right panel
   - Select "Port" → Next
   - Select "TCP" and enter "8080" in Specific local ports → Next
   - Select "Allow the connection" → Next
   - Check "Private" (uncheck Domain and Public for security) → Next
   - Name: `Service Translate - PWA Server (TCP 8080)`
   - Description: `Allow incoming connections to Service Translate PWA web server`
   - Click Finish

3. **Create Rule for Port 3001**:
   - Repeat the above steps but use:
     - Port: `3001`
     - Name: `Service Translate - WebSocket Server (TCP 3001)`
     - Description: `Allow incoming connections to Service Translate WebSocket server`

## Verification

### Check Firewall Rules

Using PowerShell:

```powershell
# List Service Translate firewall rules
netsh advfirewall firewall show rule name=all | Select-String -Pattern "Service Translate" -Context 10,5
```

Or using Windows Firewall GUI:
1. Open `wf.msc`
2. Click "Inbound Rules"
3. Look for rules named "Service Translate - PWA Server" and "Service Translate - WebSocket Server"
4. Verify they are "Enabled" and "Allow"

### Check Listening Ports

Using PowerShell:

```powershell
# Check if ports are listening
netstat -ano | findstr ":8080"
netstat -ano | findstr ":3001"
```

Expected output should show:
```
TCP    0.0.0.0:8080           0.0.0.0:0              LISTENING       <PID>
TCP    0.0.0.0:3001           0.0.0.0:0              LISTENING       <PID>
```

### Get Your Local IP Address

```powershell
# Get IPv4 address
ipconfig | Select-String -Pattern "IPv4"
```

## Testing Network Access

1. **Start both servers**:
   ```powershell
   # Terminal 1: Start PWA server
   npm run start:pwa

   # Terminal 2: Start WebSocket server
   npm run start:websocket
   ```

2. **Find your Windows PC's local IP address** (from verification step above)
   - Example: `192.168.1.100`

3. **From another device on the same network**:
   - PWA: `http://YOUR_IP:8080`
   - The PWA should automatically connect to the WebSocket server at `http://YOUR_IP:3001`

## Network Profile Settings

**IMPORTANT**: Windows Firewall rules are profile-specific. The setup script applies rules to the "Private" network profile only.

### Check Your Network Profile

```powershell
Get-NetConnectionProfile
```

### Change Network to Private (if needed)

If your network is set to "Public", change it to "Private":

1. **Using Settings UI**:
   - Open Settings → Network & Internet
   - Click on your active connection (Wi-Fi or Ethernet)
   - Under "Network profile type", select "Private"

2. **Using PowerShell** (as Administrator):
   ```powershell
   Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private
   ```
   (Replace "Wi-Fi" with your network adapter name from `Get-NetConnectionProfile`)

## Troubleshooting

### Rules Not Working

1. **Verify rules are enabled**:
   ```powershell
   netsh advfirewall firewall show rule name="Service Translate - PWA Server (TCP 8080)"
   netsh advfirewall firewall show rule name="Service Translate - WebSocket Server (TCP 3001)"
   ```

2. **Check network profile** (see section above)

3. **Temporarily disable firewall for testing**:
   ```powershell
   # TESTING ONLY - Disable firewall
   netsh advfirewall set allprofiles state off

   # Test your connection...

   # Re-enable firewall
   netsh advfirewall set allprofiles state on
   ```
   **WARNING**: Only disable the firewall temporarily for testing. Always re-enable it afterward.

### Corporate or Enterprise Networks

If you're on a corporate network:
- Group Policy may override local firewall settings
- Contact your IT department for assistance
- You may need to use VPN or specific network configurations

### Antivirus Software

Some antivirus software has its own firewall that may block connections:
- Check your antivirus firewall settings
- Add exceptions for ports 8080 and 3001
- Temporarily disable antivirus to test (then re-enable)

## Remove Service Translate Firewall Rules

To remove the firewall rules:

```powershell
# Remove PWA server rule
netsh advfirewall firewall delete rule name="Service Translate - PWA Server (TCP 8080)"

# Remove WebSocket server rule
netsh advfirewall firewall delete rule name="Service Translate - WebSocket Server (TCP 3001)"
```

Or using the GUI:
1. Open `wf.msc`
2. Click "Inbound Rules"
3. Find the Service Translate rules
4. Right-click → Delete

## Security Considerations

- **Network Profile**: Rules are applied to "Private" network profile only
  - This is appropriate for home/trusted networks
  - For "Public" networks (coffee shops, airports), rules won't apply (safer)

- **Port Scope**: Rules allow connections from any IP address on the local network
  - Appropriate when behind a home router with NAT
  - More restrictive rules can be configured if needed

- **Firewall Profiles**:
  - **Private**: Home or work networks (rules apply here)
  - **Public**: Untrusted networks (rules don't apply - safer)
  - **Domain**: Corporate/domain networks (usually managed by IT)

### Creating More Restrictive Rules

If you want to limit connections to specific IP ranges:

```powershell
# Allow only from specific subnet (example: 192.168.1.0/24)
netsh advfirewall firewall add rule `
    name="Service Translate - PWA Server (Restricted)" `
    dir=in `
    action=allow `
    protocol=TCP `
    localport=8080 `
    remoteip=192.168.1.0/24 `
    profile=private
```

## Additional Resources

- [Windows Defender Firewall documentation](https://docs.microsoft.com/en-us/windows/security/threat-protection/windows-firewall/windows-firewall-with-advanced-security)
- [Netsh AdvFirewall commands](https://docs.microsoft.com/en-us/windows-server/networking/technologies/netsh/netsh-advfirewall-firewall)
- [Network location profiles](https://support.microsoft.com/en-us/windows/make-a-wi-fi-network-public-or-private-in-windows-0460117d-8d3e-a7ac-f003-7a0da607448d)
