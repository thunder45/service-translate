# Service Translate - Local Deployment Guide

This guide covers the complete setup and deployment of Service Translate with TTS capabilities in a local environment.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Configuration](#configuration)
4. [Deployment Modes](#deployment-modes)
5. [Starting Services](#starting-services)
6. [Client Connection](#client-connection)
7. [Maintenance](#maintenance)
8. [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements
- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 8.0.0 or higher
- **Operating System**: Windows 10+, macOS 10.15+, or Linux (Ubuntu 18.04+)
- **Memory**: Minimum 4GB RAM (8GB recommended)
- **Storage**: 2GB free space for audio cache
- **Network**: WiFi network for client device connections

### AWS Requirements
- AWS Account with appropriate permissions
- AWS CLI installed and configured (recommended)
- Required AWS permissions:
  - `polly:SynthesizeSpeech`
  - `polly:DescribeVoices`
  - `transcribe:StartStreamTranscription`
  - `translate:TranslateText`

## Initial Setup

### 1. Install Dependencies

```bash
# Install all project dependencies individually
npm install
cd src/websocket-server && npm install
cd ../capture && npm install
cd ../client-pwa && npm install
```

### 2. Run Setup Scripts

```bash
# macOS Setup
cd src/capture && ./setup-macos.sh

# Windows Setup  
cd src/capture && .\setup-windows.ps1
```

The setup scripts will:
- Install system dependencies (sox, etc.)
- Install npm dependencies for all modules
- Configure firewall rules for configurable ports
- Build TypeScript code
- Validate system requirements

## Configuration

### Environment Configuration

The setup creates a `.env` file with all necessary configuration options:

```bash
# Copy the example file and edit
cp .env.example .env
# Edit .env with your specific settings
```

### Key Configuration Options

#### AWS Configuration
```env
AWS_REGION=us-east-1
AWS_POLLY_VOICE_ENGINE=neural
AWS_POLLY_OUTPUT_FORMAT=mp3
```

#### Server Configuration
```env
# WebSocket Server (configurable via WS_PORT environment variable)
WS_PORT=3001

# PWA Client Server (configurable via PWA_PORT environment variable)  
PWA_PORT=8080

# Host binding
WEBSOCKET_HOST=127.0.0.1
```

#### Audio Storage
```env
AUDIO_STORAGE_PATH=./audio-cache
AUDIO_CACHE_SIZE_MB=500
AUDIO_MAX_AGE_HOURS=48
```

#### Security Settings
```env
ENABLE_AUTH=false
POLLY_RATE_LIMIT_PER_MINUTE=60
MAX_CLIENTS_PER_SESSION=50
```

## Deployment Modes

Service Translate operates in local network mode by default:

### Local Network Deployment
- **Admin App**: Runs on main computer for audio capture and translation
- **WebSocket Server**: Handles client connections and TTS processing  
- **PWA Client Server**: Serves web interface for mobile devices
- **Client Access**: Mobile devices connect via local WiFi network

**Architecture**:
```
Admin Computer               Client Devices (WiFi)
┌─────────────────┐          ┌──────────────┐
│ Capture App     │          │ Phone/Tablet │
│ WebSocket Server│◄────────►│ (Browser)    │
│ PWA Server      │          │ Port 8080    │
│ Ports 3001,8080 │          └──────────────┘
└─────────────────┘
```

## Starting Services

### Quick Start (Recommended)

Start each service in separate terminal windows:

```bash
# Terminal 1: Start WebSocket Server
cd src/websocket-server
npm start

# Terminal 2: Start PWA Client Server
cd src/client-pwa  
npm start

# Terminal 3: Start Capture App
cd src/capture
npm run dev
```

### Individual Service Commands

```bash
# WebSocket server (handles TTS and client connections)
cd src/websocket-server && npm start

# PWA client server (serves web interface to mobile devices)
cd src/client-pwa && npm start  

# Capture app (admin interface for audio capture)
cd src/capture && npm run dev
```

### Service Configuration

**WebSocket Server Port**: Configurable via `WS_PORT` environment variable
```bash
WS_PORT=4001 cd src/websocket-server && npm start  # Custom port 4001
```

**PWA Server Port**: Configurable via `PWA_PORT` environment variable  
```bash
PWA_PORT=9090 cd src/client-pwa && npm start      # Custom port 9090
```

**Default Ports**: WebSocket (3001), PWA (8080)

## Client Connection

### Connection Process

1. **Start Services**: Ensure all services are running
2. **Get Connection URL**: Check the console output for the client URL
3. **Connect Devices**: Ensure client devices are on the same WiFi network
4. **Open Browser**: Navigate to the provided URL on client devices
5. **Enter Session ID**: Use the session ID provided by the admin

### Connection URLs

After starting services, you'll see output like:
```
📱 PWA Client URL: http://192.168.1.100:8080
🌐 WebSocket URL: ws://192.168.1.100:3001

Available on:
  http://127.0.0.1:8080
  http://192.168.1.100:8080
```

### QR Code Connection

Future enhancement - QR code generation for easy mobile connection setup.

## Maintenance

### Manual Cleanup

```bash
# Clean TypeScript build output
cd src/capture && npm run clean

# Remove old audio files (from WebSocket server)
cd src/websocket-server && rm -rf audio-cache/*

# Clear logs (if they exist)  
rm -rf logs/*
```

### Monitoring

The WebSocket server provides health endpoints:
- Health check: `http://localhost:3001/health`
- Metrics: `http://localhost:3001/metrics`  
- Security stats: `http://localhost:3001/security`

## Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Check what's using the ports (default: 8080 for PWA, 3001 for WebSocket)
lsof -i :8080   # PWA server
lsof -i :3001   # WebSocket server

# Kill processes or use custom ports
WS_PORT=4001 PWA_PORT=9090 # Use different ports
```

#### AWS Credentials Issues  
```bash
# Test AWS CLI configuration
aws sts get-caller-identity

# Reconfigure if needed
aws configure
```

#### Network Connection Problems
```bash
# Test WebSocket server health
curl http://localhost:3001/health

# Test PWA server 
curl http://localhost:8080

# Verify firewall settings
# Windows: Windows Defender Firewall
# macOS: System Preferences > Security & Privacy > Firewall  
# Linux: sudo ufw status
```

#### Audio Generation Failures
- Check AWS Polly permissions
- Verify internet connectivity
- Check cost limits and quotas
- Review error logs in `logs/service-translate.log`

### Log Files

System logs are stored in:
- **Main Log**: `logs/service-translate.log`
- **Error Log**: `logs/error.log`
- **Maintenance Log**: `MAINTENANCE_REPORT.md`

### Performance Issues

#### High Memory Usage
- Reduce audio cache size in `.env`
- Run maintenance more frequently
- Check for memory leaks in logs

#### Slow Audio Generation
- Switch from Neural to Standard Polly voices
- Check network latency to AWS
- Verify local system resources

#### Client Connection Issues
- Ensure all devices on same WiFi network
- Check firewall settings
- Verify WebSocket server is running
- Test with `curl http://localhost:3001/health`

### Getting Help

1. **Check Server Health**: Use `curl http://localhost:3001/health`
2. **Review Console Logs**: Check terminal output for errors
3. **Verify Ports**: Ensure no port conflicts (3001, 8080)
4. **Test Components**: Start services individually
5. **Check Authentication**: Review ADMIN_AUTHENTICATION_GUIDE.md

### Reset to Default

```bash
# Clean build outputs
cd src/capture && npm run clean
cd ../websocket-server && rm -rf audio-cache/* logs/*
cd ../client-pwa && rm -rf node_modules/.cache/*

# Rebuild everything
npm run build  # From each service directory
```

## Advanced Configuration

### Custom Voice Selection

Edit the voice configuration in your admin application or modify the AWS Polly settings in `.env`:

```env
AWS_POLLY_VOICE_ENGINE=neural  # or 'standard'
```

### Network Security

For network deployments, consider:
- Enabling authentication: `ENABLE_AUTH=true`
- Setting up firewall rules
- Using HTTPS (requires additional configuration)
- Implementing rate limiting

### Performance Tuning

Optimize for your environment:
- Adjust cache sizes based on available storage
- Configure cleanup intervals
- Set appropriate rate limits
- Monitor cost thresholds

---

For additional help, check the generated documentation files:
- `CONNECTION_INSTRUCTIONS.md` - Client connection details
- `FIREWALL_SETUP.md` - Firewall configuration
- `DEPLOYMENT_SUMMARY.md` - Current deployment status
- `MAINTENANCE_REPORT.md` - System health and statistics
