# Service Translate - Hybrid Real-Time Translation Architecture

**Production-ready multilingual audio translation system with admin console and web client interface.**

## Project Structure

```
src/
├── backend/          # AWS infrastructure (Cognito authentication) ✅ COMPLETE
│   ├── cdk/          # CDK stack definitions (simplified-stack.ts)
│   └── manage-auth.sh, etc.   # Admin user creation and management
├── capture/          # Admin Electron application ✅ COMPLETE
│   ├── src/          # TypeScript source files
│   │   ├── main.ts           # Electron main process
│   │   ├── direct-streaming-manager.ts  # Manages AWS + WebSocket
│   │   ├── websocket-manager.ts         # WebSocket client
│   │   ├── auth.ts                      # Cognito authentication
│   │   ├── direct-transcribe-client.ts  # AWS Transcribe streaming
│   │   ├── translation-service.ts       # AWS Translate
│   │   └── ui/                          # UI components
│   ├── index.html   # Admin UI with tabbed interface
│   └── preload.js   # Electron IPC bridge
├── websocket-server/ # Real-time TTS and session server ✅ COMPLETE
│   ├── src/         # TypeScript source files (25+ files)
│   │   ├── server.ts                # WebSocket server main
│   │   ├── session-manager.ts       # Multi-client sessions
│   │   ├── admin-identity-manager.ts # Admin authentication
│   │   ├── tts-service.ts          # Text-to-speech
│   │   └── message-router.ts       # Message handling
│   ├── admin-identities/    # Admin persistence
│   ├── sessions/           # Session storage
│   ├── audio-cache/        # TTS audio cache
│   └── logs/              # Server logs
├── client-pwa/       # Web client for attendees ✅ COMPLETE
│   ├── app.js       # PWA application logic
│   ├── index.html   # Client interface
│   ├── manifest.json # PWA manifest
│   └── icons/       # PWA icons
├── shared/           # Shared types and utilities ✅ COMPLETE
│   └── types.ts     # TypeScript definitions
└── README.md
```
**Key Directories Created at Runtime:**
- `websocket-server/admin-identities/` - Admin identity persistence
- `websocket-server/sessions/` - Session state storage
- `websocket-server/audio-cache/` - Generated TTS audio files
- `websocket-server/logs/` - Server logs and performance metrics
- `~/Library/Application Support/service-translate-capture/` - Client token storage (macOS)
- `%APPDATA%/service-translate-capture/` - Client token storage (Windows)


## Architecture Overview
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


### Hybrid Multi-Component System

```
┌───────────────────────────────────────────────────────┐
│                 Admin Workflow                        │
│  ┌─────────────────────────────────────────────────┐  │
│  │  Capture Electron App (Admin Interface)         │  │
│  │  - Cognito authentication                       │  │
│  │  - Audio capture + AWS Transcribe               │  │
│  │  - Real-time translation display                │  │
│  │  - WebSocket client for TTS coordination        │  │
│  └──────────────────┬──────────────────────────────┘  │
└─────────────────────┼─────────────────────────────────┘
                      │
                      │ WebSocket Connection (ws://127.0.0.1:3001)
                      │
  ┌───────────────────┴───────────────────┐
  │      WebSocket Server                 │
  │  - Session management                 │
  │  - TTS audio generation               │
  │  - Multi-client coordination          │
  │  - Admin identity management          │
  │  - Audio caching                      │
  └───────────────────┬───────────────────┘
                      │
                      │ WebSocket Connections (ws://server:3001)
                      │
┌─────────────────────┴──────────────────────────────────┐
│                Client Workflow                         │
│  ┌────────────────────────────────────────────────┐    │
│  │  PWA Web Client (Attendee Interface)           │    │
│  │  - Connects to WebSocket server                │    │
│  │  - Receives real-time translations             │    │
│  │  - Plays TTS audio                             │    │
│  │  - Language selection                          │    │
│  └────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────┘
```

## Implementation Status

- ✅ **Admin Electron App** - Complete with Cognito auth and audio capture
- ✅ **WebSocket Server** - Full session management and TTS generation
- ✅ **PWA Web Client** - Multi-language interface for attendees
- ✅ **Authentication System** - Cognito with admin identity management
- ✅ **Real-time Translation** - AWS Transcribe + Translate integration
- ✅ **TTS System** - AWS Polly with caching and multi-client distribution
- ✅ **Session Management** - Multi-admin session ownership and persistence

## Key Features Implemented

### Admin Console (Capture App)
- **Cognito Authentication** - Secure admin login with token storage
- **Audio Device Management** - Cross-platform microphone selection
- **Real-time Transcription** - Direct AWS Transcribe streaming
- **Translation Display** - Multi-language translation tabs
- **WebSocket Integration** - Connects to local TTS server
- **Cost Tracking** - Real-time usage monitoring

### WebSocket Server
- **Session Management** - Create, manage, and persist translation sessions
- **TTS Generation** - AWS Polly with neural/standard voices
- **Audio Caching** - Intelligent caching to reduce costs
- **Multi-Client Support** - Broadcast to multiple PWA clients
- **Admin Identity Management** - Cognito-based admin authentication
- **Performance Monitoring** - Request logging and analytics

### PWA Web Client  
- **Real-time Updates** - WebSocket connection to server
- **Language Selection** - Choose from available target languages
- **Audio Playback** - TTS audio with play/pause controls
- **Responsive Design** - Works on mobile and desktop
- **Offline Support** - Service worker for reliability

### AWS Integration
- **Cognito Authentication** - Admin user management
- **Transcribe Streaming** - Real-time speech-to-text
- **Translate Service** - Multi-language translation
- **Polly TTS** - Neural and standard voice synthesis

## Getting Started

### 1. Deploy AWS Infrastructure (One-time)
```bash
cd src/backend
npm install
cdk bootstrap  # First time only
npm run deploy
```

### 2. Create Admin User (One-time)
```bash
# Linux/macOS
cd src/backend
./manage-auth.sh create-user admin@example.com <UserPoolId> <Region>

# Windows PowerShell
cd src/backend
.\manage-auth.ps1 create-user admin@example.com <UserPoolId> <Region>
```

### 3. Start WebSocket Server
```bash
# Setup unified Cognito authentication (REQUIRED)
./setup-unified-auth.sh  # Interactive Cognito configuration

# Or manually configure .env:
# COGNITO_REGION=us-east-1
# COGNITO_USER_POOL_ID=us-east-1_xxxxxx
# COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx

cd src/websocket-server
npm install

# Linux/macOS
./start.sh

# Windows PowerShell
.\start.ps1
```
**Unified Authentication:**
The WebSocket server uses AWS Cognito for admin authentication, providing a single set of credentials for both AWS services and session management. The `setup-unified-auth.sh` script will:
- Parse Cognito configuration from CDK deployment output
- Generate `.env` file with Cognito values
- Create necessary directories for admin identities and sessions
- Optionally create a new Cognito user

**Important:** All Cognito users in the User Pool have admin access to the WebSocket server.


### 4. Start PWA Client Server (Optional)
```bash
cd src/client-pwa
npm run start  # Serves on http://localhost:8080
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

### 5. Run Admin Application
```bash
cd src/capture
# First-time setup
./setup-macos.sh     # macOS: Installs sox
# OR
.\setup-windows.ps1  # Windows: Installs dependencies

# Start admin app
npm install
npm run dev
```

### 6. Configure and Operate
1. **Capture App**: Enter AWS configuration and login
2. **Connect to Server**: WebSocket connection to local server
3. **Create Session**: Start new translation session
4. **Start Streaming**: Begin audio capture and translation
5. **Client Access**: PWA clients connect to view translations

## Architecture Deep Dive

### Data Flow

1. **Admin Audio Capture** (Capture App)
   - Microphone → Audio Processing → AWS Transcribe
   - Transcription → AWS Translate → Multiple languages

2. **Server Distribution** (WebSocket Server)
   - Translation data → TTS generation (AWS Polly)
   - Audio caching for cost optimization
   - Session management and client coordination

3. **Client Display** (PWA Web Client)
   - Real-time translation updates via WebSocket
   - TTS audio playback with controls
   - Language selection and display preferences

### Component Integration

- **Capture ↔ WebSocket**: Translation data and session commands
- **WebSocket ↔ PWA**: Real-time translation broadcast
- **Capture ↔ AWS**: Direct SDK calls for Transcribe/Translate
- **WebSocket ↔ AWS**: TTS generation and audio caching

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

### Why Hybrid TTS?
- **Quality Options**: High-quality AWS Polly voices when budget allows
- **Fallback Support**: Local Web Speech API when offline or cost-conscious
- **User Choice**: Clients can choose between cloud and local TTS
- **Cost Control**: Real-time cost tracking with configurable limits

## Technology Stack

### Admin Application
- **Framework**: Electron with TypeScript
- **Audio**: sox command-line tool, cross-platform device enumeration
- **AWS Integration**: Direct SDK for Transcribe, Translate, Polly
- **Authentication**: AWS Cognito with encrypted token storage

### WebSocket Server  
- **Framework**: Node.js with TypeScript
- **WebSocket**: Socket.io for real-time communication
- **Session Storage**: JSON file persistence
- **Audio Caching**: File-based TTS audio cache
- **Admin Management**: Cognito identity integration

### PWA Web Client
- **Framework**: Vanilla JavaScript with Service Worker
- **UI**: Responsive HTML/CSS with mobile support
- **Audio**: Web Audio API for playback controls
- **Connection**: Socket.io client for real-time updates

### AWS Services
- **Cognito**: Admin authentication and temporary credentials
- **Transcribe Streaming**: Real-time speech-to-text
- **Translate**: Multi-language text translation  
- **Polly**: Neural and standard text-to-speech

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

### Multi-Client Support
- **WebSocket Broadcast**: All clients see translations simultaneously
- **Multi-Client TTS**: TTS audio is distributed to all clients
- **Session Persistence**: Translations persist across sessions

## Production Architecture

This is a **hybrid architecture** combining:
- ✅ Local admin interface (Capture Electron app)
- ✅ Local WebSocket server for TTS and coordination
- ✅ Web-based client interface (PWA)
- ✅ AWS services for AI/ML capabilities
- ✅ Session persistence and multi-client support

**Perfect for:**
- Churches and religious organizations
- Conference centers with multiple rooms
- Educational institutions
- Multi-language events with attendee web access

**NOT suitable for:**
- Offline operation (requires AWS connectivity)
- Simple single-user translation (use mobile apps instead)

## Cost Structure

### Typical Church Service (2 hours, 60 minutes speaking)
- **AWS Transcribe**: $0.024/minute × 60 minutes = $1.44
- **AWS Translate**: ~45,000 characters × 5 languages × $15/1M = $3.38
- **AWS Polly (Standard)**: ~225,000 characters × $4/1M = $0.90
- **AWS Polly (Neural)**: ~225,000 characters × $16/1M = $3.60
- **Server Costs**: None (runs locally)
- **TTS Optimization**: Intelligent caching reduces repeat audio generation

### Total Cost Options:
- **Local TTS Only**: $4.82 per service (no Polly costs)
- **Standard Polly**: $5.72 per service (good quality)
- **Neural Polly**: $9.32 per service (premium quality)

### Cost Controls:
- Real-time cost tracking in admin application
- Configurable cost limits with automatic warnings
- Language subset selection (reduce from 5 to 2-3 languages)
- TTS mode switching (Neural → Standard → Local → Off)

## What Makes This System Unique

### Multi-Modal Architecture
- **Admin Control**: Rich Electron interface for operators
- **Client Access**: Simple web interface for attendees  
- **Real-time Sync**: All clients see translations simultaneously
- **Audio Enhancement**: TTS audio for accessibility

### Advanced Features
- **Session Management**: Persistent sessions with admin ownership
- **Cost Monitoring**: Real-time AWS usage tracking
- **Audio Caching**: Intelligent TTS caching for cost optimization
- **Cross-Platform**: Windows, macOS, Linux support
- **Holyrics Integration**: Direct integration with presentation software

This hybrid architecture provides the control and features needed for professional multi-language events while maintaining reasonable operational costs.
