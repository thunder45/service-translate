# Service Translate - Local Audio Translation

**Standalone macOS application for real-time Portuguese-to-multilingual audio translation using direct AWS streaming.**

## 🎯 What This Is

A local audio translation application that:
- Captures Portuguese audio from any macOS audio input device
- **Streams directly to AWS Transcribe Streaming** (no server required)
- **Translates directly via AWS Translate** (no server required)
- **Displays results locally** in tabbed interface with 5 languages
- **Real-time audio level monitoring** with VU meter visualization
- **Secure credential storage** with 24-hour auto-expiration
- Works completely offline after authentication

## 🏗️ Simplified Local Architecture

```
┌─────────────────┐    Direct AWS SDK   ┌─────────────────┐
│   macOS App     │ ──────────────────► │ AWS Transcribe  │
│ (Audio Capture) │                     │   Streaming     │
│                 │                     └─────────────────┘
│                 │                              │
│                 │    Direct AWS SDK    ┌───────▼─────────┐
│                 │ ◄────────────────────│ AWS Translate   │
│                 │                      │   (Direct)      │
│ Local Display   │                      └─────────────────┘
└─────────────────┘
```

### 🚀 Key Benefits:

- **100% Local Processing**: No server infrastructure needed
- **Real-time Results**: Direct AWS SDK streaming
- **Cost Effective**: Only pay for AWS Transcribe/Translate usage
- **No Limits**: Stream for hours without timeout restrictions
- **Offline Capable**: Works without internet after initial authentication

## 🛠️ Technology Stack

- **Audio Processing**: Direct AWS Transcribe Streaming + AWS Translate
- **Client**: Electron, TypeScript, Direct AWS SDK
- **Authentication**: Cognito Identity Pool for direct AWS service access
- **UI**: Native HTML/CSS/JavaScript interface

## 📁 Project Structure

```
src/
├── backend/              # Minimal AWS infrastructure (auth only) ✅
│   ├── cdk/             # CDK stack for Cognito setup
│   └── lambdas/handlers/ # Minimal Lambda functions (if needed)
├── capture/              # Local macOS Electron application ✅
│   ├── src/             # TypeScript source
│   │   ├── main.ts      # Electron main process
│   │   ├── audio-capture.ts # Real audio capture via sox
│   │   ├── auth.ts      # Cognito authentication
│   │   ├── direct-transcribe-client.ts # Direct AWS Transcribe
│   │   ├── translation-service.ts # Direct AWS Translate
│   │   ├── direct-streaming-manager.ts # Local orchestration
│   │   └── config.ts    # Configuration management
│   ├── index.html       # Local UI interface
│   ├── preload.js       # Electron IPC bridge
│   └── package.json
├── shared/               # Shared TypeScript types ✅
│   └── types.ts         # API type definitions
└── README.md
```

## 🚀 Quick Start

### 1. Deploy Authentication Infrastructure (One-time)
```bash
cd src/backend
npm install
cdk bootstrap  # First time only
npm run deploy
```

### 2. Create Admin User (One-time)
```bash
./create-admin.sh admin@example.com <UserPoolId>
```

### 3. Run Local Application
```bash
cd src/capture
./setup.sh     # Installs sox and dependencies
npm run dev    # Launches local Electron app
```

### 4. Configure and Start
1. Click "⚙️ Configuration" to open tabbed settings
2. **Connection Tab**: Enter AWS details and login credentials
3. **Audio Tab**: Select your preferred audio input device
4. Login with admin credentials (Enter key supported)
5. Click "🎤 Start Local Streaming"
6. Monitor audio levels with the VU meter
7. Speak into your selected microphone and see real-time translations in language tabs

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

## 📋 What's Working

### Local Application - Complete ✅
- **audio-capture.ts**: Real macOS audio capture using sox
- **direct-transcribe-client.ts**: Direct AWS Transcribe Streaming connection
- **translation-service.ts**: Direct AWS Translate integration
- **direct-streaming-manager.ts**: Local orchestration of the pipeline
- **main.ts**: Complete Electron app with authentication, local display

### Authentication Infrastructure - Minimal ✅
- **Cognito User Pool**: Admin authentication
- **Cognito Identity Pool**: Direct AWS service access for authenticated users
- **IAM Roles**: Permissions for Transcribe and Translate services

## 🎯 Current Status

### ✅ **COMPLETE - Local Application**
- **Local Audio Processing**: Real-time capture and streaming
- **Direct AWS Integration**: Transcribe + Translate without server
- **Authentication**: Cognito JWT + Identity Pool for direct AWS access
- **Local UI**: Real-time display of transcriptions and translations

### 🔧 **Configuration Required**
- AWS Cognito User Pool and Identity Pool setup
- Admin user creation for authentication
- Local application configuration with AWS details

## 💡 Architecture Benefits

### Why Local Processing?
- **No Server Costs**: Only pay for AWS Transcribe/Translate usage
- **No Limits**: No timeout restrictions, stream indefinitely
- **Lower Latency**: Direct connection to AWS services
- **Simplicity**: Single application, no complex infrastructure

### Why Keep Minimal Backend?
- **Authentication**: Cognito provides secure AWS access
- **Direct Access**: Identity Pool enables direct AWS service calls
- **Cost Effective**: Minimal infrastructure costs

## 📞 Support

- **Audio Issues**: Verify sox installation and microphone permissions
- **Authentication Issues**: Check Cognito User Pool and Identity Pool configuration
- **AWS Issues**: Verify IAM permissions for Transcribe and Translate
- **Application Issues**: Check Electron console for error messages

## 🔍 Cost Analysis

### Local Architecture Costs:
- **AWS Transcribe**: $0.024/minute of audio processing
- **AWS Translate**: $15 per million characters translated
- **Cognito**: Free tier covers typical usage
- **No Server Costs**: No Lambda, API Gateway, or EC2 charges
- **Total**: ~$0.024/minute + translation costs only

This local architecture provides the most cost-effective solution for individual users who need real-time audio translation without the complexity of server infrastructure.
