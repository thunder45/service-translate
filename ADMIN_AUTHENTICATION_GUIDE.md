# Admin Authentication Guide

**Service Translate - Local Direct Streaming Authentication**

## Overview

The Local Direct Streaming architecture uses minimal AWS Cognito authentication to provide secure access to AWS services (Transcribe and Translate) directly from the Electron application. This simplified authentication system eliminates server infrastructure while maintaining security and user experience.

## Key Features

- **Local-only authentication** - No server infrastructure required
- **Direct AWS SDK integration** - Credentials used for Transcribe/Translate services  
- **Encrypted credential storage** - 24-hour automatic expiration
- **Cross-platform support** - Works on macOS, Windows, and Linux
- **Minimal setup** - Simple Cognito User Pool deployment

## Setup Instructions

### 1. Deploy AWS Infrastructure

```bash
cd src/backend
npm install
cdk bootstrap  # First time only
npm run deploy
```

Note the CDK output values:
- **Cognito User Pool ID**: `us-east-1_xxxxxx`
- **Cognito Client ID**: `xxxxxxxxxxxxxxxxxxxxxxxxxx`
- **AWS Region**: `us-east-1`

### 2. Create Admin User

```bash
# Linux/macOS
cd src/backend
./manage-auth.sh create-user admin@example.com us-east-1_xxxxxx us-east-1

# Windows PowerShell  
cd src/backend
.\manage-auth.ps1 create-user admin@example.com us-east-1_xxxxxx us-east-1
```

### 3. Configure and Run Capture App

1. Launch: `cd src/capture && npm run dev`
2. Click "⚙️ Configuration" 
3. Enter AWS credentials in Connection tab
4. Click "Login"
5. Configure audio device in Audio tab
6. Click "🎤 Start Local Streaming"

## Authentication Architecture

The local authentication uses:
- **AWS Cognito User Pool** for user management
- **Encrypted local storage** for credential persistence  
- **Direct AWS SDK calls** to Transcribe and Translate services
- **24-hour credential expiration** for security

## Security Features

- **Local processing** - No audio data sent to external servers
- **Encrypted storage** - Credentials protected by OS keychain
- **Temporary credentials** - Automatic 24-hour expiration
- **Minimal permissions** - Only Transcribe/Translate/Polly access

## Troubleshooting

### Authentication Issues
- Verify Cognito User Pool ID and Client ID
- Check username/password accuracy  
- Ensure user exists in Cognito User Pool

### AWS Service Issues
- Check network connectivity to AWS
- Verify Cognito Identity Pool permissions
- Ensure services available in your region

### Storage Issues
- Check app write permissions to user directory
- Verify antivirus isn't blocking Electron app

## Migration from Legacy System

This guide replaces the previous complex WebSocket server authentication documented in `docs/LEGACY_ADMIN_AUTHENTICATION_GUIDE.md`. The new system eliminates:

- Multi-admin session management
- WebSocket server authentication  
- Complex session ownership
- Server-side credential storage

## Additional Resources

- [Main README](README.md) - Complete project overview
- [Backend README](src/backend/README.md) - Infrastructure setup
- [Deployment Guide](DEPLOYMENT_GUIDE.md) - Complete deployment
- [Security Guide](SECURITY_GUIDE.md) - Security best practices
