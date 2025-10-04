# Service Translate - Windows Setup Guide

## Prerequisites

- **Windows 10/11**
- **Node.js 20+** - Download from [nodejs.org](https://nodejs.org/)
- **PowerShell** (included with Windows)

## Quick Setup

### Option 1: Automated Setup (Recommended)

Run as Administrator:

```powershell
cd src/capture
.\setup-windows.ps1
```

This will automatically:
- Install Chocolatey (if not present)
- Install sox audio processing tool
- Install Node.js dependencies
- Build the TypeScript application

### Option 2: Manual Setup

1. **Install Chocolatey** (if not already installed):
   ```powershell
   Set-ExecutionPolicy Bypass -Scope Process -Force
   [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
   iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
   ```

2. **Install sox**:
   ```powershell
   choco install sox -y
   ```

3. **Install dependencies and build**:
   ```powershell
   cd src/capture
   npm install
   npm run build
   ```

## Running the Application

```powershell
cd src/capture
npm run dev
```

## Audio Device Configuration

Windows audio devices are automatically detected using PowerShell WMI queries. The application will list all available audio input devices in the Audio configuration tab.

### Troubleshooting Audio Devices

If no devices appear:

1. **Check Windows Sound Settings**:
   - Right-click speaker icon → Sound settings
   - Verify input devices are enabled

2. **Test sox manually**:
   ```powershell
   sox -t waveaudio -d -t raw -r 16000 -e signed-integer -b 16 -c 1 test.raw
   ```
   Speak into your microphone, then press Ctrl+C. If this works, the app should work.

3. **List available devices**:
   ```powershell
   sox --help-device waveaudio
   ```

## Platform Differences

### macOS vs Windows

| Feature | macOS | Windows |
|---------|-------|---------|
| Audio Driver | CoreAudio | WaveAudio |
| Device Enumeration | system_profiler | PowerShell WMI |
| Default Device | `-d` | `-t waveaudio -d` |
| Device Selection | `coreaudio:N` | Device index `N` |

### Known Limitations

- **Bluetooth devices**: May have higher latency on Windows
- **USB devices**: Require proper drivers installed
- **Virtual devices**: VB-Cable and similar tools are supported

## AWS Configuration

The AWS configuration is identical to macOS:

1. Deploy backend infrastructure (one-time):
   ```bash
   cd src/backend
   npm install
   npm run deploy
   ```

2. Create admin user:
   ```bash
   ./create-admin.sh admin@example.com <UserPoolId>
   ```

3. Configure the app with AWS details in the Connection tab

## Common Issues

### "sox is not recognized"

**Solution**: Restart PowerShell/Terminal after installing sox, or add to PATH manually:
```powershell
$env:Path += ";C:\ProgramData\chocolatey\bin"
```

### "Access Denied" during setup

**Solution**: Run PowerShell as Administrator

### No audio devices detected

**Solution**: 
1. Check Windows Privacy Settings → Microphone
2. Allow desktop apps to access microphone
3. Restart the application

### Audio quality issues

**Solution**:
- Use USB microphone instead of built-in
- Reduce background noise
- Check Windows sound settings for proper input level

## Performance Tips

- **Close unnecessary applications** to reduce CPU usage
- **Use wired microphone** for better audio quality
- **Disable audio enhancements** in Windows sound settings
- **Run on AC power** for consistent performance

## Development

### Building from Source

```powershell
cd src/capture
npm install
npm run build
npm run dev
```

### Debugging

Enable Electron DevTools by uncommenting in `main.ts`:
```typescript
mainWindow.webContents.openDevTools();
```

## Support

For Windows-specific issues:
- Check sox installation: `sox --version`
- Verify Node.js: `node --version`
- Test audio capture: `sox -t waveaudio -d -t raw test.raw`

For general application issues, see main README.md
