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
Admin Computer                    External Host (Optional)
┌─────────────────────────┐      ┌─────────────────────┐
│     Capture App         │      │    Holyrics App     │
│  ┌──────────────────┐   │      │  (Church Software)  │
│  │  Audio Capture   │   │      │                     │
│  │     ↓            │   │      │  Receives translated│
│  │  AWS Transcribe  │───┼──────►  text via HTTP API  │
│  │     ↓            │   │      │                     │
│  │  AWS Translate   │   │      └─────────────────────┘
│  │     ↓            │   │
│  │  Send to TTS     │   │
│  └────────┬─────────┘   │
└───────────┼─────────────┘
            │ WebSocket
            ▼
┌─────────────────────────┐      ┌─────────────────────────┐
│   WebSocket Server      │      │   PWA Client Server     │
│   (Node.js - Port 3001) │      │   (HTTP - Port 8080)    │
│  ┌──────────────────┐   │      │  ┌──────────────────┐   │
│  │ Session Manager  │   │      │  │ Serves Web App   │   │
│  │ AWS Polly TTS    │   │      │  │ Static Files     │   │
│  │ Audio Cache      │   │      │  │ Service Worker   │   │
│  │ /audio/ endpoint │   │      │  └──────────────────┘   │
│  └──────────────────┘   │      └─────────────────────────┘
└─────────────────────────┘                  │ HTTP (static files)
            │ WebSocket + HTTP (/audio/)     │
            │                                │
            └────────────────┬───────────────┘
                             ▼
┌───────────────────────────────────────────────────────┐
│              Client Devices (WiFi)                    │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│  │ Phone/PWA     │  │ Tablet/PWA    │  │ Laptop/PWA    │
│  │ Web Browser   │  │ Web Browser   │  │ Web Browser   │
│  │               │  │               │  │               │
│  │ • Loads PWA   │  │ • Loads PWA   │  │ • Loads PWA   │
│  │   from :8080  │  │   from :8080  │  │   from :8080  │
│  │ • WebSocket   │  │ • WebSocket   │  │ • WebSocket   │
│  │   to :3001    │  │   to :3001    │  │   to :3001    │
│  │ • Audio via   │  │ • Audio via   │  │ • Audio via   │
│  │   :3001/audio │  │   :3001/audio │  │   :3001/audio │
│  │ • Local TTS   │  │ • Local TTS   │  │ • Local TTS   │
│  │   fallback    │  │   fallback    │  │   fallback    │
│  └───────────────┘  └───────────────┘  └───────────────┘
└───────────────────────────────────────────────────────┘
```

### 🚀 Key Benefits

- **Local Network Operation**: No cloud infrastructure costs beyond AWS services
- **Hybrid TTS**: High-quality AWS Polly voices with local Web Speech API fallback
- **Session-Based Access**: Simple session codes for client joining
- **Real-time Broadcasting**: Instant text and audio delivery to all connected clients
- **Cost Effective**: Under $10/hour for typical church service
- **Professional Integration**: Direct Holyrics API integration for church displays

### 🎯 Architecture Principles

**Separation of Concerns:**
- **Streaming** (Audio Capture) and **Session Management** (Broadcasting) are completely independent
- Start/stop streaming without affecting session state
- Create/end sessions without affecting streaming
- Manual session selection from active sessions list (no auto-reconnect)
- See [docs/SESSION_STREAMING_SEPARATION.md](docs/SESSION_STREAMING_SEPARATION.md) for detailed architecture

**Valid State Combinations:**
- ❌ No Streaming + ❌ No Session: Initial state
- ❌ No Streaming + ✅ Session Active: Session ready, waiting to stream
- ✅ Streaming + ❌ No Session: Local-only transcription/translation
- ✅ Streaming + ✅ Session Active: Full operation with client broadcasting

## 🛠️ Technology Stack

### Admin Application
- **Platform**: Electron with TypeScript
- **Audio Processing**: AWS Transcribe Streaming + AWS Translate
- **Audio Tools**: sox command-line tool, cross-platform device enumeration
- **Integrations**: Holyrics API, WebSocket client
- **Authentication**: Cognito User Pool + Identity Pool with encrypted token storage

### TTS Server (WebSocket Server)
- **Platform**: Node.js with TypeScript
- **Framework**: Socket.IO for real-time communication
- **TTS**: AWS Polly integration (optional)
- **Audio**: Local file serving with HTTP endpoints
- **Session Storage**: JSON file persistence with admin identity management
- **Security**: Rate limiting, session validation, authentication middleware
- **Monitoring**: Comprehensive logging and health checks

### Progressive Web App
- **Platform**: Vanilla JavaScript PWA
- **TTS**: Web Speech API with AWS Polly fallback
- **UI**: Responsive design with accessibility features
- **Connection**: Socket.io client for real-time updates
- **Offline**: Service Worker for offline capability
- **Audio**: Advanced audio player with queue management

## 📁 Project Structure

```
# Root setup scripts (system-wide configuration) ✅
setup-macos.sh              # macOS system setup (sox, firewall, dependencies)
setup-windows.ps1           # Windows system setup (chocolatey, sox, firewall)
setup-unified-auth.sh       # Cognito configuration for all components

src/
├── backend/              # AWS infrastructure (Cognito auth) ✅
│   ├── cdk/             # CDK stack for Cognito setup
│   │   ├── app.ts       # CDK application entry point
│   │   └── simplified-stack.ts # Minimal auth-only stack (Cognito only)
│   ├── manage-auth.sh   # Admin user creation script (Linux/macOS)
│   ├── manage-auth.ps1  # Admin user creation script (Windows)
│   ├── test-connection.sh/ps1 # Connection testing scripts
│   ├── verify-deployment.sh/ps1 # Deployment verification scripts
│   ├── AUTH-MANAGEMENT.md # Authentication setup guide
│   └── package.json
├── capture/              # Cross-platform Electron application ✅
│   ├── src/             # TypeScript source code
│   │   ├── main.ts      # Electron main process
│   │   ├── auth.ts      # Cognito authentication client
│   │   ├── audio-capture.ts # Cross-platform audio capture
│   │   ├── direct-streaming-manager.ts # AWS services orchestration
│   │   ├── direct-transcribe-client.ts # AWS Transcribe streaming
│   │   ├── websocket-manager.ts # WebSocket client for TTS server
│   │   ├── translation-service.ts # AWS Translate integration
│   │   ├── secure-token-storage.ts # Encrypted token management
│   │   ├── holyrics-integration.ts # Holyrics API integration
│   │   ├── cost-tracker.ts # Real-time cost monitoring
│   │   ├── monitoring-dashboard.ts # Performance monitoring
│   │   ├── tts-manager.ts # TTS coordination
│   │   ├── tts-fallback-manager.ts # Local TTS fallback
│   │   └── ui/          # UI modules (auth-manager.js, etc.)
│   ├── index.html       # Electron renderer HTML
│   ├── preload.js       # Electron preload script
│   └── package.json
├── websocket-server/     # TTS Server with WebSocket ✅
│   ├── src/             # TypeScript source code (25+ files)
│   │   ├── server.ts    # Main server with Socket.IO
│   │   ├── cognito-auth.ts # Cognito authentication service
│   │   ├── admin-identity-manager.ts # Admin session management
│   │   ├── admin-identity-store.ts # Admin persistence
│   │   ├── message-router.ts # WebSocket message routing
│   │   ├── message-validator.ts # Input validation
│   │   ├── polly-service.ts # AWS Polly TTS integration
│   │   ├── session-manager.ts # Session lifecycle management
│   │   ├── session-security.ts # Session validation
│   │   ├── audio-manager.ts # Audio file management and serving
│   │   ├── audio-cache-manager.ts # Intelligent caching
│   │   ├── security-middleware.ts # Authentication and rate limiting
│   │   ├── admin-security-middleware.ts # Admin access control
│   │   ├── rate-limiter.ts # Rate limiting implementation
│   │   ├── token-store.ts # In-memory token management
│   │   ├── tts-service.ts # TTS coordination
│   │   ├── tts-fallback-manager.ts # TTS fallback handling
│   │   ├── analytics-manager.ts # Usage analytics
│   │   ├── error-logger.ts # Error tracking
│   │   └── cloudwatch-integration.ts # AWS monitoring
│   ├── admin-identities/ # Persistent admin identity storage
│   ├── audio-cache/     # Generated TTS audio files
│   ├── sessions/        # Session persistence
│   ├── data/            # Runtime data storage
│   ├── logs/            # Server logs and monitoring
│   ├── start.sh         # Unix startup script (WS_PORT configurable)
│   ├── start.ps1        # Windows startup script (WS_PORT configurable)
│   ├── COGNITO_SETUP.md # Cognito configuration guide
│   ├── MESSAGE_PROTOCOLS.md # WebSocket API documentation
│   ├── SECURITY_IMPLEMENTATION.md # Security architecture
│   ├── .env.example     # Environment configuration template
│   └── package.json
├── client-pwa/           # Progressive Web Application ✅
│   ├── app.js           # Main PWA application
│   ├── sw.js            # Service Worker for offline support
│   ├── performance-manager.js # Performance optimizations
│   ├── user-analytics.js # Client-side analytics
│   ├── lazy-loader.js   # Dynamic loading optimizations
│   ├── manifest.json    # PWA manifest
│   ├── icons/           # PWA icons (16x16, 32x32, 144x144)
│   │   ├── create_icons.py # Icon generation script
│   │   └── *.png, *.svg # Generated icons
│   └── package.json
├── shared/               # Shared TypeScript types ✅
│   ├── types.ts         # Comprehensive type definitions
│   ├── types.js/.map    # Compiled JavaScript types
│   └── types.d.ts/.map  # TypeScript declarations
└── config/               # Configuration management (unused) ⚠️
    ├── aws-setup.ts     # AWS service configuration
    ├── environment.ts   # Environment-specific settings
    └── network-config.ts # Network and security configuration
```

**Key Directories Created at Runtime:**
- `websocket-server/admin-identities/` - Admin identity persistence
- `websocket-server/sessions/` - Session state storage
- `websocket-server/audio-cache/` - Generated TTS audio files
- `websocket-server/logs/` - Server logs and performance metrics
- `~/Library/Application Support/service-translate-capture/` - Client token storage (macOS)
- `%APPDATA%/service-translate-capture/` - Client token storage (Windows)

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
cd src/backend

# Create admin user in Cognito User Pool
# Linux/macOS
./manage-auth.sh create-user admin@example.com <UserPoolId> <Region>
# Windows PowerShell
.\manage-auth.ps1 create-user admin@example.com <UserPoolId> <Region>

# Change password (if needed)
# Linux/macOS
./manage-auth.sh change-password admin@example.com <UserPoolId> <ClientId>
# Windows PowerShell
.\manage-auth.ps1 change-password admin@example.com <UserPoolId> <ClientId>
```

### 3. Setup WebSocket Server with Cognito Authentication
```bash
# Setup unified Cognito authentication (REQUIRED) - from project root
./setup-unified-auth.sh  # Interactive Cognito configuration

# Or manually configure .env in src/websocket-server/:
# COGNITO_REGION=us-east-1
# COGNITO_USER_POOL_ID=us-east-1_xxxxxx
# COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx

cd src/websocket-server
npm install
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

### 4. Run System Setup (One-time)
```bash
# Platform-specific system setup (run from project root)
./setup-macos.sh     # macOS: Installs sox, configures firewall, installs dependencies
# OR
.\setup-windows.ps1  # Windows: Installs chocolatey, sox, configures firewall, installs dependencies

# Configure AWS credentials in the app UI after starting
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
npm run dev
```

## 🔧 Implementation Details

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

### Hybrid Operation
- **Multi-Component System**: Capture app + WebSocket server + PWA client work together
- **Local Network Deployment**: Runs on local network without cloud infrastructure costs
- **Real-time Processing**: Audio processed and distributed to multiple clients
- **Distributed Results**: Translations displayed on admin interface and client devices

## 📋 Implementation Status

### Admin Application - Complete ✅
- **Cross-platform support**: Windows 10/11 and macOS 10.15+
- **Audio capture**: Real-time audio with device selection and VU meter
- **AWS integration**: Transcribe and Translate services with direct SDK calls
- **WebSocket client**: Session management and translation broadcasting
- **Holyrics integration**: Direct API integration for church displays
- **Security**: Encrypted credential storage with auto-expiration
- **Cost tracking**: Real-time AWS usage monitoring

### TTS Server (WebSocket Server) - Complete ✅
- **Session management**: Create, join, and manage translation sessions
- **Real-time broadcasting**: Instant text and audio delivery to all clients
- **AWS Polly integration**: Optional TTS generation (neural/standard voices)
- **Security middleware**: Authentication, rate limiting, and validation
- **Audio serving**: Local HTTP server for Polly-generated audio files
- **Analytics**: Comprehensive monitoring and performance tracking
- **Error handling**: Robust error logging and recovery
- **Admin identity management**: Cognito-based admin authentication

### Progressive Web App - Complete ✅
- **Session joining**: Simple session ID-based access
- **Multi-language support**: 5 target languages with selection
- **Hybrid TTS**: Web Speech API with AWS Polly fallback
- **Responsive design**: Works on phones, tablets, and desktops
- **Offline support**: Service Worker for offline capability
- **Accessibility**: Full keyboard navigation and screen reader support
- **Performance optimizations**: Lazy loading and caching

### AWS Infrastructure - Minimal ✅
- **Cognito authentication**: User Pool and Identity Pool only
- **IAM roles**: Least-privilege access for Transcribe, Translate, and Polly services
- **No Lambda functions**: Eliminated server-side Lambda infrastructure
- **No WebSocket API Gateway**: Direct local WebSocket server instead

## 🔧 For Developers: Technical Architecture

### Component Data Flow

#### 1. Admin Audio Capture (Capture App)
```
Microphone → Audio Processing → AWS Transcribe → Transcription Text
     ↓
AWS Translate → Multiple Language Translations
     ↓
WebSocket Send → TTS Server
```

#### 2. Server Distribution (WebSocket Server)
```
Translation Data → TTS Generation (AWS Polly) → Audio Cache
     ↓
Session Management → Client Coordination → Multi-Client Broadcast
```

#### 3. Client Display (PWA Web Client)
```
WebSocket Receive → Translation Updates → Language Selection
     ↓
TTS Audio Playback → Display Preferences → Accessibility
```

### Component Integration

- **Capture ↔ WebSocket**: Translation data and session commands via WebSocket client
- **WebSocket ↔ PWA**: Real-time translation broadcast via Socket.IO
- **Capture ↔ AWS**: Direct SDK calls for Transcribe/Translate/Polly
- **WebSocket ↔ AWS**: TTS generation and audio caching via AWS SDK

### Advanced Architecture Features

#### Multi-Modal Architecture
- **Admin Control**: Rich Electron interface for operators
- **Client Access**: Simple web interface for attendees  
- **Real-time Sync**: All clients see translations simultaneously
- **Audio Enhancement**: TTS audio for accessibility

#### Session Management Architecture
- **Session Persistence**: JSON file-based storage with metadata
- **Admin Ownership**: Each session tied to authenticated admin
- **Client Coordination**: Broadcast translation updates to all session clients
- **State Separation**: Sessions independent of audio streaming state

#### Security Architecture
- **Multi-Layer Security**: Admin authentication + session validation + rate limiting
- **Token Management**: Encrypted storage with automatic refresh
- **Network Security**: CORS configuration and IP-based controls
- **Input Validation**: Message validation and sanitization

### Why This Hybrid Architecture?

#### Separation of Concerns
- **Capture app focuses on**: Audio processing and AWS service integration
- **WebSocket server focuses on**: Multi-client coordination and TTS distribution
- **PWA client focuses on**: User interface and audio playback

#### Scalability Benefits
- **Multiple capture apps** can share one TTS Server
- **Flexible deployment**: TTS Server can run on different machine if needed
- **Better resource utilization**: Centralized TTS caching and audio management
- **Easier debugging**: Clear separation between transcription and distribution

#### Cost Optimization
- **Intelligent caching**: Avoid duplicate TTS generation
- **Local network operation**: No cloud infrastructure costs
- **Configurable limits**: Real-time cost tracking with automatic warnings
- **Hybrid TTS**: Local fallback reduces cloud costs

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

## 🔍 Cost Analysis

### Typical Church Service (2 hours, 60 minutes speaking)
- **AWS Transcribe**: $0.024/minute × 60 minutes = $1.44
- **AWS Translate**: ~45,000 characters × 5 languages × $15/1M = $3.38
- **AWS Polly (Standard)**: ~225,000 characters × $4/1M = $0.90
- **AWS Polly (Neural)**: ~225,000 characters × $16/1M = $3.60
- **AWS Cognito**: Minimal usage, typically under $0.50

### Total Cost Options:
- **Local TTS Only**: $4.82 per service (no Polly costs)
- **Standard Polly**: $5.72 per service (good quality)
- **Neural Polly**: $9.32 per service (premium quality)

### Cost Controls:
- Real-time cost tracking in admin application
- Configurable cost limits with automatic warnings
- Language subset selection (reduce from 5 to 2-3 languages)
- TTS mode switching (Neural → Standard → Local → Off)

## 🎯 Perfect For

**Churches and Religious Organizations**:
- Real-time sermon translation with professional display integration
- Simple session-based access for congregation members
- Cost-effective operation with intelligent caching

**Conference Centers and Educational Institutions**:
- Multi-language events with attendee web access
- Professional admin controls with cost tracking
- Cross-platform compatibility

**NOT suitable for**:
- Offline operation (requires AWS connectivity)
- Simple single-user translation (use mobile apps instead)

## 📞 Support

- **Audio Issues**: Verify sox installation and microphone permissions
- **Authentication Issues**: Check Cognito User Pool and Identity Pool configuration
- **AWS Issues**: Verify IAM permissions for Transcribe and Translate
- **Application Issues**: Check Electron console for error messages
- **Windows-specific**: See [WINDOWS_SETUP.md](WINDOWS_SETUP.md)
- **Holyrics Integration**: See [HOLYRICS_SETUP.md](HOLYRICS_SETUP.md)
- **Security**: See [SECURITY_GUIDE.md](SECURITY_GUIDE.md)
- **Deployment**: See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)

---

This hybrid architecture provides the control and features needed for professional multi-language events while maintaining reasonable operational costs and technical flexibility.
