# Windows Setup & Testing Guide

**Version**: 1.0  
**Branch**: windows-support  
**Last Updated**: October 14, 2025

This guide provides step-by-step instructions for setting up and testing the Service Translate Capture App on Windows.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Project Setup](#project-setup)
4. [Configuration](#configuration)
5. [Testing Procedures](#testing-procedures)
6. [Troubleshooting](#troubleshooting)
7. [Building Windows Installer](#building-windows-installer)

---

## Prerequisites

### Required Software

#### 1. Git for Windows
**Download**: https://git-scm.com/download/win

**Installation**:
```powershell
# Using winget (Windows 11 or Windows 10 with App Installer)
winget install --id Git.Git -e --source winget

# Or using Chocolatey (if installed)
choco install git -y
```

**Verify installation**:
```powershell
git --version
# Expected: git version 2.x.x
```

#### 2. Node.js (v18 or higher)
**Download**: https://nodejs.org/ (LTS version recommended)

**Installation**:
```powershell
# Using winget
winget install OpenJS.NodeJS.LTS

# Or using Chocolatey
choco install nodejs-lts -y
```

**Verify installation**:
```powershell
node --version
# Expected: v18.x.x or v20.x.x

npm --version
# Expected: 9.x.x or 10.x.x
```

#### 3. Visual Studio Code (Optional but Recommended)
**Download**: https://code.visualstudio.com/

```powershell
# Using winget
winget install Microsoft.VisualStudioCode

# Or using Chocolatey
choco install vscode -y
```

#### 4. PowerShell 7+ (Optional but Recommended)
**Download**: https://github.com/PowerShell/PowerShell/releases

```powershell
# Using winget
winget install Microsoft.PowerShell

# Or using Chocolatey
choco install powershell-core -y
```

---

## Initial Setup

### Step 1: Enable Script Execution

PowerShell scripts are disabled by default on Windows. Enable them:

1. **Open PowerShell as Administrator**:
   - Press `Win + X`
   - Select "Windows PowerShell (Admin)" or "Terminal (Admin)"

2. **Set Execution Policy**:
```powershell
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
```

3. **Verify**:
```powershell
Get-ExecutionPolicy -List
# CurrentUser should show: RemoteSigned
```

### Step 2: Configure Git

```powershell
# Set your Git username and email
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"

# Configure line endings (important for cross-platform)
git config --global core.autocrlf true

# Verify configuration
git config --list
```

### Step 3: Create Working Directory

```powershell
# Navigate to your preferred location (e.g., Documents)
cd $HOME\Documents

# Or create a dedicated projects folder
mkdir Projects
cd Projects
```

---

## Project Setup

### Step 1: Clone Repository

```powershell
# Clone the repository
git clone git@github.com:thunder45/service-translate.git

# Or use HTTPS if SSH is not configured
git clone https://github.com/thunder45/service-translate.git

# Navigate to project directory
cd service-translate
```

### Step 2: Checkout Windows Support Branch

```powershell
# Fetch all branches
git fetch origin

# Checkout the windows-support branch
git checkout windows-support

# Verify you're on the correct branch
git branch --show-current
# Expected output: windows-support

# Pull latest changes
git pull origin windows-support
```

### Step 3: Run Automated Setup Script

**IMPORTANT**: Run PowerShell as Administrator for this step.

```powershell
# Navigate to capture app directory
cd src\capture

# Run the setup script
.\setup-windows.ps1
```

**What the script does**:
1. Checks Node.js version (requires v18+)
2. Installs Chocolatey (package manager) if not present
3. Installs sox (audio processing tool) via Chocolatey
4. Installs npm dependencies
5. Compiles TypeScript code

**Expected Output**:
```
Service Translate - Windows Setup
==================================

Checking for Node.js...
Node.js installed: v18.x.x

Installing sox (audio processing tool)...
sox installed successfully

Installing Node.js dependencies...
Dependencies installed successfully

Building TypeScript...
Build completed successfully

Setup complete!
```

### Step 4: Manual Setup (If Automated Script Fails)

If the automated script fails, follow these manual steps:

#### Install Chocolatey
```powershell
# Run in Administrator PowerShell
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Close and reopen PowerShell as Administrator
```

#### Install Sox
```powershell
choco install sox -y

# Verify sox installation
sox --version
# Expected: sox: SoX v14.x.x
```

#### Install Node Dependencies
```powershell
cd src\capture
npm install

# Expected: npm should install all dependencies without errors
```

#### Build TypeScript
```powershell
npm run build

# Expected: TypeScript files compiled to dist/ directory
```

---

## Configuration

### Step 1: Configure Windows Privacy Settings

The app needs microphone access. Configure Windows settings:

1. **Open Settings**:
   - Press `Win + I`
   - Go to "Privacy & security" → "Microphone"

2. **Enable Microphone Access**:
   - Toggle "Microphone access" to **ON**
   - Toggle "Let apps access your microphone" to **ON**
   - Toggle "Let desktop apps access your microphone" to **ON**

### Step 2: Configure Windows Firewall (if needed)

If running the WebSocket server:

1. **Open Windows Defender Firewall**:
   - Search for "Windows Defender Firewall"
   - Click "Advanced settings"

2. **Create Inbound Rule**:
   - Click "Inbound Rules" → "New Rule"
   - Select "Port" → "Next"
   - Select "TCP" → Specific local ports: **3001** (WebSocket server default)
   - Select "Allow the connection" → "Next"
   - Check all profiles (Domain, Private, Public) → "Next"
   - Name: "Service Translate WebSocket"
   - Click "Finish"

### Step 3: AWS Credentials Configuration

The app requires AWS credentials. Follow the main authentication guide:

```powershell
# Open the authentication guide
notepad ..\..\..\ADMIN_AUTHENTICATION_GUIDE.md
```

**Quick Setup**:
1. Configure AWS Cognito credentials
2. Set up AWS region (default: us-east-1)
3. Configure Cognito User Pool details

---

## Testing Procedures

### Test 1: Application Launch

```powershell
# From src/capture directory
npm run dev
```

**Expected Behavior**:
- Electron window opens
- Login screen appears
- No console errors

**Common Issues**:
- "Cannot find module": Run `npm install` again
- "Port already in use": Close other instances
- Window doesn't appear: Check Windows Defender didn't block it

### Test 2: Authentication Flow

1. **Enter Credentials**:
   - Username: Your Cognito username
   - Password: Your Cognito password

2. **Click Login**

**Expected Behavior**:
- Login successful message
- Main application UI appears
- Token stored in: `%APPDATA%\service-translate-capture\cognito-tokens.enc`

**Verify Token Storage**:
```powershell
# Check if token file exists
Test-Path "$env:APPDATA\service-translate-capture\cognito-tokens.enc"
# Expected: True

# Check file size (should be > 0)
(Get-Item "$env:APPDATA\service-translate-capture\cognito-tokens.enc").Length
# Expected: Number greater than 0
```

### Test 3: Audio Capture

1. **Select Microphone Device**:
   - In app UI, select your microphone from dropdown

2. **Click "Start Streaming"**

**Expected Behavior**:
- Microphone icon shows activity
- Audio level meter responds to sound
- No "sox not found" errors

**Troubleshoot Audio**:
```powershell
# List available audio devices (using sox)
sox -V

# Test microphone recording (5 seconds)
sox -d -t wav test.wav trim 0 5

# Play back the recording
sox test.wav -d

# Clean up
del test.wav
```

### Test 4: Token Persistence

1. **Close the application** (after successful login)

2. **Restart the application**:
```powershell
npm run dev
```

**Expected Behavior**:
- App starts without login prompt
- Goes directly to main UI
- Shows logged-in state

**If Login Prompt Appears**:
- Check token file exists (see Test 2)
- Check token hasn't expired (4-hour validity)
- Review console for error messages

### Test 5: WebSocket Server Integration

If testing with WebSocket server:

1. **Start WebSocket Server** (separate terminal):
```powershell
cd src\websocket-server
npm install
npm start
```

2. **In Capture App**:
   - Configure WebSocket URL: `ws://127.0.0.1:3001`
   - Click "Connect"

**Expected Behavior**:
- "Connected" status indicator
- Session list updates
- Can create and join sessions

### Test 6: Complete Workflow Test

**End-to-End Test**:

1. ✅ Launch app (`npm run dev`)
2. ✅ Login with credentials
3. ✅ Select microphone device
4. ✅ Configure target language (e.g., Spanish)
5. ✅ Start streaming
6. ✅ Speak into microphone
7. ✅ Verify transcription appears
8. ✅ Verify translation appears
9. ✅ Stop streaming
10. ✅ Check cost tracking displays correctly
11. ✅ Close and restart app (test persistence)

---

## Troubleshooting

### Issue: "Cannot find module 'electron'"

**Solution**:
```powershell
cd src\capture
rm -r node_modules
rm package-lock.json
npm install
```

### Issue: "sox: command not found"

**Solution**:
```powershell
# Reinstall sox
choco install sox -y

# Verify it's in PATH
$env:Path -split ';' | Select-String sox

# If not in PATH, add it manually:
$env:Path += ";C:\Program Files\sox-14-4-2"

# Make permanent (requires restart):
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Program Files\sox-14-4-2", "Machine")
```

### Issue: "Execution Policy" Error

**Solution**:
```powershell
# Run as Administrator
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
```

### Issue: Microphone Not Working

**Checklist**:
1. ✅ Windows microphone permissions enabled
2. ✅ Correct device selected in app
3. ✅ Microphone not in use by another app
4. ✅ Sox installed correctly
5. ✅ Device drivers up to date

**Test Microphone**:
```powershell
# Windows Sound Recorder test
soundrecorder /FILE test.m4a /DURATION 0000:00:05
```

### Issue: Application Won't Start

**Debug Steps**:
```powershell
# Check Node.js version
node --version  # Should be 18+

# Check for port conflicts
netstat -ano | findstr :3001

# Run with verbose logging
$env:NODE_ENV="development"
npm run dev
```

### Issue: Token Storage Fails

**Check**:
```powershell
# Verify app data directory exists
mkdir "$env:APPDATA\service-translate-capture" -Force

# Check file permissions
icacls "$env:APPDATA\service-translate-capture"
# Should show your user account with full control

# Check if Electron safeStorage is available
# This requires Windows CryptoAPI (DPAPI) - should work on Windows 10/11
```

### Issue: Build Errors

**Solution**:
```powershell
# Clean build
cd src\capture
rm -r dist -Force -ErrorAction SilentlyContinue
npm run build

# Check for TypeScript errors
npx tsc --noEmit
```

---

## Building Windows Installer

**Coming in Phase 3** - After successful testing.

Will use electron-builder to create:
- `.exe` installer (NSIS)
- Portable `.exe` (no installation required)
- `.msi` installer (Windows Installer)

---

## Testing Checklist

Print this checklist and mark off each item:

### Pre-Testing Setup
- [ ] Node.js 18+ installed
- [ ] Git installed
- [ ] PowerShell execution policy set
- [ ] Project cloned
- [ ] On `windows-support` branch
- [ ] Dependencies installed (`npm install`)
- [ ] TypeScript compiled (`npm run build`)
- [ ] Sox installed

### Windows-Specific Configuration
- [ ] Microphone privacy settings enabled
- [ ] Firewall rules configured (if needed)
- [ ] AWS credentials configured

### Application Testing
- [ ] App launches successfully
- [ ] Login screen appears
- [ ] Authentication works
- [ ] Tokens stored at `%APPDATA%\service-translate-capture\`
- [ ] Token persistence works (restart test)
- [ ] Microphone device detected
- [ ] Audio capture works
- [ ] Transcription works
- [ ] Translation works
- [ ] Cost tracking displays
- [ ] App can be closed and reopened

### Issue Documentation
- [ ] Any bugs encountered documented
- [ ] Screenshots of errors captured
- [ ] Console logs saved
- [ ] Performance notes recorded

---

## Reporting Issues

When reporting Windows-specific issues, include:

1. **System Information**:
```powershell
# Get Windows version
[System.Environment]::OSVersion.Version

# Get Node.js version
node --version

# Get npm version
npm --version

# Get sox version
sox --version
```

2. **Error Logs**:
   - Console output
   - Screenshots of errors
   - Contents of log files

3. **Steps to Reproduce**:
   - Exact commands run
   - Actions taken in UI
   - Expected vs actual behavior

**Where to Report**:
- GitHub Issues
- Include `[Windows]` tag in title
- Attach logs and screenshots

---

## Next Steps After Testing

Once testing is complete:

1. **Document Findings**:
   - Create test results summary
   - List any bugs or issues
   - Note performance observations

2. **Report Back**:
   - Update compatibility audit with results
   - Create issues for any bugs found
   - Suggest improvements

3. **Prepare for Distribution**:
   - If all tests pass, ready for Phase 3
   - Build Windows installer
   - Create user documentation

---

## Quick Reference Commands

```powershell
# Setup
git clone https://github.com/thunder45/service-translate.git
cd service-translate
git checkout windows-support
cd src\capture
.\setup-windows.ps1

# Run Application
npm run dev

# Build Only
npm run build

# Check Status
node --version
npm --version
sox --version
git branch --show-current

# Clean Install
rm -r node_modules, dist -Force
npm install
npm run build
```

---

## Support

For help:
- Check troubleshooting section
- Review `WINDOWS_COMPATIBILITY_AUDIT.md`
- See main `ADMIN_AUTHENTICATION_GUIDE.md`
- Contact development team

---

**Good luck with testing! 🚀**
