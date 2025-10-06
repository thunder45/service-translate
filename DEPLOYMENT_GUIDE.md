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
# Install all project dependencies
npm run install:all

# Or install individually
npm install
cd src/websocket-server && npm install
cd ../capture && npm install
cd ../client-pwa && npm install
```

### 2. Run Setup Script

```bash
# Run the automated setup
npm run setup

# For development environment
npm run setup:dev
```

The setup script will:
- Create necessary directories
- Generate configuration files
- Validate AWS credentials
- Check network configuration
- Create startup scripts

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
WEBSOCKET_HOST=localhost
WEBSOCKET_PORT=3001
HTTP_SERVER_PORT=3000
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

Service Translate supports three deployment modes:

### 1. Local Mode (Default)
- Single machine deployment
- Admin and server on same computer
- Clients connect via local network

```bash
npm run start:local
```

### 2. Network Mode
- Server accessible via LAN
- Multiple admin connections possible
- Enhanced security features

```bash
npm run start:network
```

### 3. Cloud Mode
- Server hosted remotely
- Global accessibility
- Advanced monitoring

```bash
npm run start:cloud
```

## Starting Services

### Quick Start (Recommended)

```bash
# Start all services in local mode
npm run start:local
```

### Manual Start

```bash
# Start individual services
npm run start:server    # WebSocket server
npm run start:pwa       # PWA HTTP server
npm run start:capture   # Admin application
```

### Development Mode

```bash
# Start with hot reload and debugging
npm run start:dev
```

### Platform-Specific Scripts

#### Linux/macOS
```bash
./start-service-translate.sh
```

#### Windows
```cmd
start-service-translate.bat
```

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
📱 Client connection URL: http://192.168.1.100:3000
🌐 WebSocket URL: ws://192.168.1.100:3001
```

### QR Code Connection

The system generates a `client-connection.json` file with QR code data for easy client connection.

## Maintenance

### Automated Maintenance

```bash
# Run full maintenance
npm run maintenance

# View statistics only
npm run maintenance:stats
```

### Manual Cleanup

```bash
# Clean all build artifacts and caches
npm run clean

# Remove old audio files
rm -rf audio-cache/*

# Clear logs
rm -rf logs/*
```

### Monitoring

The system automatically:
- Tracks AWS service costs
- Monitors audio cache size
- Logs system performance
- Generates maintenance reports

## Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Check what's using the port
lsof -i :3000
lsof -i :3001

# Kill the process or change ports in .env
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
# Check network configuration
npm run maintenance:stats

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
- Test with `curl http://localhost:3000/health`

### Getting Help

1. **Check Logs**: Review log files for error messages
2. **Run Diagnostics**: Use `npm run maintenance:stats`
3. **Verify Configuration**: Check `.env` file settings
4. **Test Components**: Start services individually
5. **Network Issues**: Use connection instructions in `CONNECTION_INSTRUCTIONS.md`

### Reset to Default

```bash
# Complete reset
npm run clean
rm .env
rm -rf audio-cache logs temp
npm run setup
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