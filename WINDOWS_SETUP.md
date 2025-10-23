# Service Translate - Windows Setup Guide

## Prerequisites

### System Requirements
- **Windows 10/11** (64-bit)
- **Node.js 18+** - Download from [nodejs.org](https://nodejs.org/) (LTS version recommended)
- **PowerShell** (included with Windows)
- **4GB RAM minimum** (8GB recommended)
- **Microphone device** (built-in, USB, or Bluetooth)

### Required Software Installation

#### Node.js
```powershell
# Using winget (Windows 11 or Windows 10 with App Installer)
winget install OpenJS.NodeJS.LTS

# Or download manually from nodejs.org
```

**Verify installation**:
```powershell
node --version  # Expected: v18.x.x or higher
npm --version   # Expected: 9.x.x or higher
```

#### Git (Optional but recommended)
```powershell
# Using winget
winget install --id Git.Git -e --source winget

# Verify
git --version
```

---

## Setup Options

### Option 1: Automated Setup (Recommended)

1. **Enable PowerShell script execution** (run PowerShell as Administrator):
   ```powershell
   Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
   ```

2. **Navigate to project and run setup**:
   ```powershell
   cd service-translate
   .\setup-windows.ps1
   ```

**What the automated setup does**:
- Installs Chocolatey package manager (if not present)
- Installs sox audio processing tool
- Installs Node.js dependencies
- Compiles TypeScript code
- Configures Windows firewall (optional)

### Option 2: Manual Setup

If the automated script fails:

1. **Install Chocolatey** (run PowerShell as Administrator):
   ```powershell
   Set-ExecutionPolicy Bypass -Scope Process -Force
   [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
   iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
   ```

2. **Install sox audio tool**:
   ```powershell
   choco install sox -y
   
   # Verify installation
   sox --version
   ```

3. **Install project dependencies**:
   ```powershell
   # Dependencies are automatically installed by setup script
   # Manual installation (if needed):
   cd src\capture && npm install
   cd src\client-pwa && npm install
   cd src\capture && npm run build
   ```

---

## Configuration

### Windows Privacy Settings

The app needs microphone access:

1. **Open Settings** (Win + I)
2. **Go to Privacy & security → Microphone**
3. **Enable**:
   - Microphone access: **ON**
   - Let apps access your microphone: **ON**
   - Let desktop apps access your microphone: **ON**

### Windows Firewall (if using WebSocket server)

For network access to clients:

1. **Open Windows Defender Firewall with Advanced Security**
2. **Create Inbound Rule**:
   - Port: TCP
   - Specific local ports: `3001,8080` (default ports)
   - Allow the connection
   - All profiles (Domain, Private, Public)
   - Name: "Service Translate"

**For custom ports**: Update firewall rules if using custom WS_PORT or PWA_PORT environment variables.

### AWS Configuration

Follow the main authentication guide for AWS setup:

1. **Deploy AWS infrastructure** (one-time):
   ```bash
   cd src/backend
   npm install
   npm run deploy
   ```

2. **Create admin user**:
   ```bash
   # Linux/macOS
   ./manage-auth.sh create-user admin@example.com <UserPoolId> <Region>
   
   # Windows PowerShell
   .\manage-auth.ps1 create-user admin@example.com <UserPoolId> <Region>
   ```

3. **Configure app**: Enter Cognito details in the Connection tab

---

## Running the Application

```powershell
cd src\capture
npm run dev
```

**Expected behavior**:
- Electron window opens
- Login screen appears
- No console errors

---

## Audio Configuration

### Device Detection

Windows audio devices are automatically detected using PowerShell WMI queries. Available devices appear in the Audio configuration tab.

### Platform Differences

| Feature | macOS | Windows |
|---------|-------|---------|
| Audio Driver | CoreAudio | WaveAudio |
| Device Enumeration | system_profiler | PowerShell WMI |
| Default Device | `-d` | `-t waveaudio -d` |
| Device Selection | `coreaudio:N` | Device index `N` |

### Audio Device Troubleshooting

**If no devices appear**:

1. **Check Windows Sound Settings**:
   - Right-click speaker icon → Sound settings
   - Verify input devices are enabled and not disabled

2. **Test sox manually**:
   ```powershell
   # Test 5-second recording
   sox -t waveaudio -d -t wav test.wav trim 0 5
   
   # Play back
   sox test.wav -d
   
   # Clean up
   del test.wav
   ```

3. **List available devices**:
   ```powershell
   sox --help-device waveaudio
   ```

**Known limitations**:
- Bluetooth devices may have higher latency
- USB devices require proper drivers
- Virtual devices (VB-Cable, etc.) are supported

---

## Testing & Verification

### Basic Functionality Test

1. **Launch app**: `npm run dev`
2. **Login** with Cognito credentials
3. **Select microphone** in Audio tab
4. **Start streaming** and speak
5. **Verify**:
   - Audio level meter responds
   - Transcription appears
   - Translation works (if configured)

### Token Persistence Test

1. **Close app** after successful login
2. **Restart app**
3. **Expected**: Direct access to main UI without login prompt

**Token storage location**: `%APPDATA%\service-translate-capture\cognito-tokens.enc`

---

## Common Issues & Solutions

### "sox is not recognized"

```powershell
# Option 1: Restart PowerShell/Terminal after sox installation

# Option 2: Add to PATH manually
$env:Path += ";C:\ProgramData\chocolatey\bin"

# Option 3: Reinstall sox
choco install sox -y --force
```

### "Access Denied" during setup

**Solution**: Run PowerShell as Administrator

### "Cannot find module 'electron'"

```powershell
cd src\capture
rm -r node_modules
rm package-lock.json
npm install
```

### No audio devices detected

1. **Check microphone permissions** (Privacy settings)
2. **Restart the application**
3. **Test Windows Sound Recorder** to verify device works
4. **Check device drivers** are up to date

### Application won't start

```powershell
# Check Node.js version
node --version  # Should be 18+

# Check for port conflicts
netstat -ano | findstr :3001

# Clean and rebuild
cd src\capture
rm -r dist -Force -ErrorAction SilentlyContinue
npm run build
```

### Audio quality issues

**Solutions**:
- Use USB microphone instead of built-in
- Reduce background noise
- Check Windows sound settings for input levels
- Disable audio enhancements in Windows sound properties

### Token storage fails

```powershell
# Verify app data directory exists and is writable
mkdir "$env:APPDATA\service-translate-capture" -Force

# Check permissions
icacls "$env:APPDATA\service-translate-capture"
```

---

## Performance Tips

- **Close unnecessary applications** to reduce CPU usage during real-time processing
- **Use wired microphone** for better audio quality and lower latency
- **Disable Windows audio enhancements** in sound properties
- **Run on AC power** for consistent performance during long sessions
- **Keep Windows updated** for latest audio driver compatibility

---

## Development

### Building from Source

```powershell
cd src\capture
npm install
npm run build
npm run dev
```

### Debugging

Enable Electron DevTools by uncommenting in `main.ts`:
```typescript
mainWindow.webContents.openDevTools();
```

### Clean Build

```powershell
cd src\capture
rm -r node_modules, dist -Force
npm install
npm run build
```

---

## Quick Reference Commands

```powershell
# Initial Setup (from project root)
.\setup-windows.ps1

# Run Application
npm run dev

# Verify Installation
node --version
npm --version
sox --version

# Test Audio
sox -t waveaudio -d -t wav test.wav trim 0 5

# Clean Reinstall
rm -r node_modules -Force
npm install
npm run build
```

---

## Support

**For Windows-specific issues**:
- Check sox installation: `sox --version`
- Verify Node.js: `node --version` 
- Test audio capture: `sox -t waveaudio -d -t raw test.raw`
- Review console logs for error messages

**For general application issues**:
- See main [README.md](README.md)
- Review [ADMIN_AUTHENTICATION_GUIDE.md](ADMIN_AUTHENTICATION_GUIDE.md)
- Check [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)

---

**Windows setup complete! The application should now be ready for use on Windows 10/11.** 🚀
