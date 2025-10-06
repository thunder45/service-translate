# Service Translate - Real-Time Audio Translation with TTS

**Multi-platform application for real-time Portuguese-to-multilingual audio translation with Text-to-Speech capabilities.**

## 🎯 What This Is

A comprehensive real-time translation system that includes:
- **Admin Application**: Electron app for audio capture and translation management
- **WebSocket Server**: Local server for client communication and session management  
- **Progressive Web App**: Client interface for congregation members with TTS playback
- **Holyrics Integration**: Direct API integration for church presentation software
- **Cross-Platform Support**: Works on Windows 10/11 and macOS 10.15+
- **Hybrid TTS**: AWS Polly cloud voices with local Web Speech API fallback

## 🏗️ Local TTS Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Admin Machine                        │
│  ┌──────────────────┐    ┌──────────────────────────┐  │
│  │  Electron App    │    │   Local WebSocket        │  │
│  │  (Transcription) │◄──►│   Server (Node.js)       │  │
│  │  + AWS Services  │    │   + Session Management   │  │
│  └────────┬─────────┘    └──────────┬───────────────┘  │
│           │ AWS Polly                │ Local Network    │
│           ▼ (Cloud TTS)              ▼ (Church WiFi)   │
│  ┌──────────────────┐    ┌──────────────────────────┐  │
│  │   Audio Files    │    │   HTTP Server            │  │
│  │  (Local Storage) │◄──►│   (Audio Serving)        │  │
│  └──────────────────┘    └──────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
            ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
            │ PWA Client 1 │ │ PWA Client 2 │ │ PWA Client N │
            │ (Phone/Web)  │ │ (Tablet/Web) │ │ (Laptop/Web) │
            │ Local TTS +  │ │ Local TTS +  │ │ Local TTS +  │
            │ Cloud Audio  │ │ Cloud Audio  │ │ Cloud Audio  │
            └──────────────┘ └──────────────┘ └──────────────┘
```

### 🚀 Key Benefits:

- **Local Network Operation**: No cloud infrastructure costs beyond AWS services
- **Hybrid TTS**: High-quality AWS Polly voices with local Web Speech API fallback
- **Session-Based Access**: Simple session codes for client joining
- **Real-time Broadcasting**: Instant text and audio delivery to all connected clients
- **Cost Effective**: Under $3/hour for typical church service

## 🛠️ Technology Stack

### Admin Application
- **Platform**: Electron with TypeScript
- **Audio Processing**: AWS Transcribe Streaming + AWS Translate
- **TTS**: AWS Polly integration with cost tracking
- **Authentication**: Cognito User Pool + Identity Pool
- **Integrations**: Holyrics API, WebSocket client

### WebSocket Server  
- **Platform**: Node.js with TypeScript
- **Framework**: Socket.IO for real-time communication
- **Security**: Rate limiting, session validation, authentication middleware
- **Audio**: Local file serving with HTTP endpoints
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
│   │   ├── main.ts      # Electron main process with TTS integration
│   │   ├── audio-capture.ts # Cross-platform audio capture
│   │   ├── direct-streaming-manager.ts # Enhanced with TTS & WebSocket
│   │   ├── tts-manager.ts # AWS Polly TTS integration
│   │   ├── websocket-manager.ts # WebSocket client for server communication
│   │   ├── cost-tracker.ts # Real-time cost monitoring
│   │   ├── holyrics-integration.ts # Holyrics API integration
│   │   └── monitoring-dashboard.ts # Performance monitoring
│   ├── setup.sh        # macOS setup script
│   ├── setup-windows.ps1 # Windows setup script
│   └── package.json
├── websocket-server/     # Local WebSocket server ✅
│   ├── src/             # TypeScript source
│   │   ├── server.ts    # Main server with Socket.IO
│   │   ├── session-manager.ts # Session lifecycle management
│   │   ├── audio-manager.ts # Audio file management and serving
│   │   ├── tts-service.ts # AWS Polly integration
│   │   ├── security-middleware.ts # Authentication and rate limiting
│   │   └── analytics-manager.ts # Usage analytics and monitoring
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

### 3. Setup Local Environment
```bash
# Install all dependencies
npm run install:all

# Run automated setup
npm run setup

# For development
npm run setup:dev
```

### 4. Start All Services
```bash
# Start everything in local mode
npm run start:local

# Or start services individually
npm run start:server    # WebSocket server
npm run start:pwa       # PWA HTTP server  
npm run start:capture   # Admin application
```

### 5. Configure and Use
1. **Admin App**: Configure AWS credentials and audio settings
2. **Create Session**: Start a session with a simple ID (e.g., "CHURCH-2025-001")
3. **Client Access**: Share the client URL with congregation members
4. **Start Translation**: Begin speaking and see real-time translations with TTS

## 🔧 Key Implementation Details

### Local Audio Processing Pipeline
1. **macOS Audio Capture**: Real microphone input via sox command-line tool
2. **Direct AWS Transcribe Streaming**: Real-time Portuguese speech-to-text
3. **Direct AWS Translate**: Multi-language translation (EN, ES, FR, DE, IT)
4. **Local Display**: Real-time results shown in the application window

### Authentication & Security
- **Cognito User Pool**: Admin authentication with JWT tokens
- **Cognito Identity Pool**: Direct AWS service access for authenticated users
- **IAM Roles**: Least-privilege access for Transcribe and Translate services
- **Secure Token Storage**: Encrypted using Electron's safeStorage API

### Local Operation
- **No Server Required**: Application works independently
- **Direct AWS Access**: Authenticated users stream directly to AWS services
- **Real-time Processing**: Audio processed as it's captured
- **Local Results**: All translations displayed in the local interface

## 📋 What's Implemented

### Admin Application - Complete ✅
- **Cross-platform support**: Windows 10/11 and macOS 10.15+
- **Audio capture**: Real-time audio with device selection and VU meter
- **AWS integration**: Transcribe, Translate, and Polly services
- **TTS management**: Cost tracking and quality control
- **WebSocket client**: Session management and broadcasting
- **Holyrics integration**: Direct API integration for church displays
- **Security**: Encrypted credential storage with auto-expiration

### WebSocket Server - Complete ✅
- **Session management**: Create, join, and manage translation sessions
- **Real-time broadcasting**: Instant text and audio delivery
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
- **Real-Time Translation**: Portuguese to 5 languages with TTS playback
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

### Why Local Network Architecture?
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
