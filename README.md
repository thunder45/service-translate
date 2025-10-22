# Service Translate - Real-Time Audio Translation with TTS

**Multi-platform application for real-time multilingual audio translation with Text-to-Speech capabilities.**

## 🎯 What This Is

A comprehensive real-time translation system that includes:
- **Admin Application**: Electron app for audio capture and translation management
- **WebSocket Server**: Local server for client communication and session management  
- **Progressive Web App**: Client interface for congregation members with TTS playback
- **Holyrics Integration**: Direct API integration for church presentation software
- **Cross-Platform Support**: Works on Windows 10/11 and macOS 10.15+
- **Hybrid TTS**: AWS Polly cloud voices with local Web Speech API fallback

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Capture App                          │
│  ┌──────────────┐    ┌──────────────┐                  │
│  │   Audio      │───▶│  Transcribe  │                  │
│  │   Capture    │    │   (AWS)      │                  │
│  └──────────────┘    └──────┬───────┘                  │
│                              │                           │
│                              ▼                           │
│                      ┌──────────────┐                   │
│                      │  Translate   │                   │
│                      │   (AWS)      │                   │
│                      └──────┬───────┘                   │
│                             │                            │
│              ┌──────────────┴──────────────┐            │
│              ▼                              ▼            │
│      ┌──────────────┐              ┌──────────────┐    │
│      │  Holyrics    │              │  TTS Server  │    │
│      │  (Optional)  │              │  + Polly TTS │    │
│      └──────────────┘              └──────┬───────┘    │
└─────────────────────────────────────────────┼──────────┘
                                              │
                    ┌─────────────────────────┼─────────────────────┐
                    │                         │                     │
                    ▼                         ▼                     ▼
            ┌──────────────┐        ┌──────────────┐      ┌──────────────┐
            │ PWA Client 1 │        │ PWA Client 2 │      │ PWA Client N │
            │ (Phone/Web)  │        │ (Tablet/Web) │      │ (Laptop/Web) │
            │ Server Audio │        │ Server Audio │      │ Server Audio │
            │ or Local TTS │        │ or Local TTS │      │ or Local TTS │
            └──────────────┘        └──────────────┘      └──────────────┘
```

### 🚀 Key Benefits:

- **Local Network Operation**: No cloud infrastructure costs beyond AWS services
- **Hybrid TTS**: High-quality AWS Polly voices with local Web Speech API fallback
- **Session-Based Access**: Simple session codes for client joining
- **Real-time Broadcasting**: Instant text and audio delivery to all connected clients
- **Cost Effective**: Under $3/hour for typical church service

### 🎯 Architecture Principles

**Separation of Concerns:**
- **Streaming** (Audio Capture) and **Session Management** (Broadcasting) are completely independent
- Start/stop streaming without affecting session state
- Create/end sessions without affecting streaming
- Manual session selection from active sessions list (no auto-reconnect)
- See [SESSION_STREAMING_SEPARATION.md](SESSION_STREAMING_SEPARATION.md) for detailed architecture

**Valid State Combinations:**
- ❌ No Streaming + ❌ No Session: Initial state
- ❌ No Streaming + ✅ Session Active: Session ready, waiting to stream
- ✅ Streaming + ❌ No Session: Local-only transcription/translation
- ✅ Streaming + ✅ Session Active: Full operation with client broadcasting

## 🛠️ Technology Stack

### Admin Application
- **Platform**: Electron with TypeScript
- **Audio Processing**: AWS Transcribe Streaming + AWS Translate
- **Integrations**: Holyrics API, WebSocket client
- **Authentication**: Cognito User Pool + Identity Pool

### TTS Server (WebSocket Server)
- **Platform**: Node.js with TypeScript
- **Framework**: Socket.IO for real-time communication
- **TTS**: AWS Polly integration (optional)
- **Audio**: Local file serving with HTTP endpoints
- **Security**: Rate limiting, session validation, authentication middleware
- **Monitoring**: Comprehensive logging and health checks

### Progressive Web App
- **Platform**: Vanilla JavaScript PWA
- **TTS**: Web Speech API with AWS Polly fallback
- **UI**: Responsive design with accessibility features
- **Offline**: Service Worker for offline capability
- **Audio**: Advanced audio player with queue management

## 📁 Project Structure

```
src/
├── backend/              # Minimal AWS infrastructure (auth only) ✅
│   ├── cdk/             # CDK stack for Cognito setup
│   └── lambdas/handlers/ # WebSocket Lambda functions
├── capture/              # Cross-platform Electron application ✅
│   ├── src/             # TypeScript source
│   │   ├── main.ts      # Electron main process
│   │   ├── audio-capture.ts # Cross-platform audio capture
│   │   ├── direct-streaming-manager.ts # Transcribe + Translate orchestration
│   │   ├── websocket-manager.ts # WebSocket client for TTS server
│   │   ├── cost-tracker.ts # Real-time cost monitoring
│   │   ├── holyrics-integration.ts # Holyrics API integration
│   │   └── monitoring-dashboard.ts # Performance monitoring
│   ├── setup-macos.sh   # macOS setup script
│   ├── setup-windows.ps1 # Windows setup script
│   └── package.json
├── websocket-server/     # TTS Server with WebSocket ✅
│   ├── src/             # TypeScript source
│   │   ├── server.ts    # Main server with Socket.IO
│   │   ├── cognito-auth.ts # Cognito authentication service
│   │   ├── polly-service.ts # AWS Polly TTS integration
│   │   ├── session-manager.ts # Session lifecycle management
│   │   ├── audio-manager.ts # Audio file management and serving
│   │   ├── security-middleware.ts # Authentication and rate limiting
│   │   └── analytics-manager.ts # Usage analytics and monitoring
│   ├── .env.example     # Environment configuration template
│   └── package.json
├── client-pwa/           # Progressive Web Application ✅
│   ├── app.js           # Main PWA application
│   ├── sw.js            # Service Worker for offline support
│   ├── performance-manager.js # Performance optimizations
│   ├── user-analytics.js # Client-side analytics
│   ├── manifest.json    # PWA manifest
│   └── package.json
├── shared/               # Shared TypeScript types ✅
│   └── types.ts         # Comprehensive type definitions
└── config/               # Configuration management ✅
    ├── aws-setup.ts     # AWS service configuration
    ├── environment.ts   # Environment-specific settings
    └── network-config.ts # Network and security configuration
```

## 🚀 Quick Start

### 1. Deploy AWS Infrastructure (One-time)
```bash
cd src/backend
npm install
cdk bootstrap  # First time only
npm run deploy
```

### 2. Create Admin User (One-time)
```bash
./create-admin.sh admin@example.com <UserPoolId>
./first-login.sh admin@example.com <ClientId> <NewPassword>
```

### 3. Setup WebSocket Server with Cognito Authentication
```bash
cd src/websocket-server
npm install

# Setup unified Cognito authentication (REQUIRED)
./setup-unified-auth.sh  # Interactive Cognito configuration

# Or manually configure .env:
# COGNITO_REGION=us-east-1
# COGNITO_USER_POOL_ID=us-east-1_xxxxxx
# COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Port Configuration

Both servers support configurable ports:

```bash
# WebSocket Server (default: 3001)
WS_PORT=4001 cd src/websocket-server && npm start

# PWA Client Server (default: 8080)  
PWA_PORT=9090 cd src/client-pwa && npm start

# Setup scripts automatically configure firewall for custom ports
WS_PORT=4001 PWA_PORT=9090 ./setup-macos.sh
```

**Unified Authentication:**
The WebSocket server uses AWS Cognito for admin authentication, providing a single set of credentials for both AWS services and session management. The `setup-unified-auth.sh` script will:
- Parse Cognito configuration from CDK deployment output
- Generate `.env` file with Cognito values
- Create necessary directories for admin identities and sessions
- Optionally create a new Cognito user

**Important:** All Cognito users in the User Pool have admin access to the WebSocket server.

### 4. Setup Capture App
```bash
cd src/capture
npm install
# Configure AWS credentials in the app UI
```

### 5. Start All Services
```bash
# Start TTS Server
cd src/websocket-server
npm start

# Start PWA (in another terminal)
cd src/client-pwa
npm start

# Start Capture App (in another terminal)
cd src/capture
npm start
```

## 🔧 Key Implementation Details

### Translation Pipeline
1. **Audio Capture**: Real microphone input via sox (macOS) or native (Windows)
2. **AWS Transcribe Streaming**: Real-time speech-to-text (configurable source language)
3. **AWS Translate**: Multi-language translation (configurable target languages)
4. **Holyrics Display**: Optional display on church screens
5. **TTS Server**: Sends translations to TTS Server for processing

### TTS Processing (Server-Side)
1. **Receive Translations**: TTS Server receives text from capture app
2. **Generate Audio**: Calls AWS Polly for each enabled language (optional)
3. **Store & Serve**: Saves audio files and serves via HTTP
4. **Broadcast**: Sends translations + audio URLs to all clients

### Client Audio Options
1. **Server Audio**: High-quality AWS Polly voices (if TTS enabled)
2. **Local TTS**: Browser Web Speech API (free, works offline)
3. **Text-Only**: Display translations without audio

### Authentication & Security
- **Unified Cognito Authentication**: Single set of credentials for AWS services and WebSocket server
- **Cognito User Pool**: Admin authentication with Cognito tokens (access, ID, refresh)
- **Cognito Identity Pool**: Direct AWS service access for authenticated users
- **IAM Roles**: Least-privilege access for Transcribe and Translate services
- **Secure Token Storage**: Encrypted using Electron's safeStorage API
- **Token Management**: Automatic token refresh with 5-minute expiry warnings

### Local Operation
- **No Server Required**: Application works independently
- **Direct AWS Access**: Authenticated users stream directly to AWS services
- **Real-time Processing**: Audio processed as it's captured
- **Local Results**: All translations displayed in the local interface

## 📋 What's Implemented

### Admin Application - Complete ✅
- **Cross-platform support**: Windows 10/11 and macOS 10.15+
- **Audio capture**: Real-time audio with device selection and VU meter
- **AWS integration**: Transcribe and Translate services
- **WebSocket client**: Session management and translation broadcasting
- **Holyrics integration**: Direct API integration for church displays
- **Security**: Encrypted credential storage with auto-expiration

### TTS Server - Complete ✅
- **Session management**: Create, join, and manage translation sessions
- **Real-time broadcasting**: Instant text and audio delivery
- **AWS Polly integration**: Optional TTS generation (neural/standard voices)
- **Security middleware**: Authentication, rate limiting, and validation
- **Audio serving**: Local HTTP server for Polly-generated audio files
- **Analytics**: Comprehensive monitoring and performance tracking
- **Error handling**: Robust error logging and recovery

### Progressive Web App - Complete ✅
- **Session joining**: Simple session ID-based access
- **Multi-language support**: 5 target languages with selection
- **Hybrid TTS**: Web Speech API with AWS Polly fallback
- **Responsive design**: Works on phones, tablets, and desktops
- **Offline support**: Service Worker for offline capability
- **Accessibility**: Full keyboard navigation and screen reader support

### AWS Infrastructure - Minimal ✅
- **Cognito authentication**: User Pool and Identity Pool
- **WebSocket API**: Session management and broadcasting
- **Lambda functions**: Essential handlers for WebSocket operations
- **IAM roles**: Least-privilege access for all services

## 🎯 Current Status

### ✅ **PRODUCTION READY**
- **Complete TTS System**: Admin app, WebSocket server, and PWA client
- **Cross-Platform**: Windows and macOS support with automated setup
- **Real-Time Translation**: Configurable source and target languages with TTS playback
- **Session Management**: Simple session-based access for clients
- **Cost Optimization**: Real-time cost tracking with configurable limits
- **Church Integration**: Direct Holyrics API integration
- **Security**: Comprehensive authentication and rate limiting

### 🔧 **Configuration Required**
- AWS infrastructure deployment (one-time)
- Admin user creation and password setup
- Local network configuration for client access
- Optional Holyrics integration setup

## 💡 Architecture Benefits

### Why TTS Server Architecture?
- **Separation of Concerns**: Capture app focuses on transcription/translation
- **Centralized TTS**: One place for Polly logic and audio management
- **Flexible Deployment**: TTS Server can run on different machine if needed
- **Better Scalability**: Multiple capture apps can share one TTS Server
- **Easier Debugging**: Clear separation between transcription and TTS

### Why Local Network?
- **Cost Effective**: No cloud infrastructure costs beyond AWS services
- **High Performance**: Local network latency for client communication
- **Scalable**: Supports 50+ concurrent clients per session
- **Reliable**: Works without internet for clients after initial connection

### Why Hybrid TTS?
- **Quality Options**: High-quality AWS Polly voices when budget allows
- **Fallback Support**: Local Web Speech API when offline or cost-conscious
- **User Choice**: Clients can choose between cloud and local TTS
- **Cost Control**: Real-time cost tracking with configurable limits

## 📞 Support

- **Audio Issues**: Verify sox installation and microphone permissions
- **Authentication Issues**: Check Cognito User Pool and Identity Pool configuration
- **AWS Issues**: Verify IAM permissions for Transcribe and Translate
- **Application Issues**: Check Electron console for error messages

## 🔍 Cost Analysis

### Typical Church Service (2 hours, 60 minutes speaking)
- **AWS Transcribe**: $0.024/minute × 60 minutes = $1.44
- **AWS Translate**: ~45,000 characters × 5 languages × $15/1M = $3.38
- **AWS Polly (Standard)**: ~225,000 characters × $4/1M = $0.90
- **AWS Polly (Neural)**: ~225,000 characters × $16/1M = $3.60
- **WebSocket/Lambda**: Minimal usage, typically under $0.50

### Total Cost Options:
- **Local TTS Only**: $4.82 per service (no Polly costs)
- **Standard Polly**: $5.72 per service (good quality)
- **Neural Polly**: $9.32 per service (premium quality)

### Cost Controls:
- Real-time cost tracking in admin application
- Configurable cost limits with automatic warnings
- Language subset selection (reduce from 5 to 2-3 languages)
- TTS mode switching (Neural → Standard → Local → Off)
