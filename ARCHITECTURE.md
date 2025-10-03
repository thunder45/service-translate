# Service Translate - Local Direct Streaming Architecture

## 🏗️ Architecture Overview

Service Translate uses a **local direct streaming architecture** that processes audio entirely on the local machine, streaming directly to AWS services for optimal cost and performance.

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

## 🎯 Design Principles

### 1. **Direct AWS Service Access**
- **No server infrastructure**: Audio streams directly to AWS Transcribe
- **No API Gateway**: Eliminates request/response overhead
- **SDK-managed streaming**: AWS handles chunking, buffering, and reconnection

### 2. **Local Processing**
- **Real-time display**: Translations shown immediately in local UI
- **Secure storage**: Credentials encrypted using Electron safeStorage
- **Device selection**: Comprehensive audio input device enumeration

### 3. **Cost Optimization**
- **Pay-per-use**: Only pay for actual audio processing time
- **No server costs**: No Lambda, API Gateway, or EC2 charges
- **Efficient scaling**: AWS services auto-scale without infrastructure

## 🔧 Component Architecture

### Local Application (macOS Electron)

#### **Audio Device Management**
```typescript
// Comprehensive device enumeration using system_profiler
const devices = await execAsync('system_profiler SPAudioDataType');
// Parses all available input devices including Bluetooth headsets
```

#### **DirectTranscribeClient**
```typescript
// Direct connection to AWS Transcribe Streaming
const client = new TranscribeStreamingClient({
  region: 'us-east-1',
  credentials: fromCognitoIdentityPool({
    identityPoolId: 'us-east-1:xxx',
    logins: {
      'cognito-idp.us-east-1.amazonaws.com/us-east-1_xxx': jwtToken
    }
  })
});
```

#### **TranslationService**
```typescript
// Direct connection to AWS Translate
const translateClient = new TranslateClient({
  region: 'us-east-1',
  credentials: fromCognitoIdentityPool(/* same config */)
});
```

#### **DirectStreamingManager**
- Orchestrates audio capture → transcription → translation → local display
- Handles real-time streaming without buffering delays
- Manages connection lifecycle and error recovery
- Supports audio device selection

#### **User Interface Features**
- **Tabbed Configuration**: Connection and Audio settings separated
- **VU Meter**: Real-time audio level visualization with 20-bar display
- **Language Tabs**: Clean display of translations in EN, ES, FR, DE, IT
- **Enter Key Login**: Improved authentication UX
- **Logout Functionality**: Secure credential clearing

### Backend (Minimal AWS Infrastructure)

#### **Cognito Authentication**
- **User Pool**: Admin authentication with JWT tokens
- **Identity Pool**: Direct AWS service access for authenticated users
- **IAM Roles**: Least-privilege access to Transcribe/Translate only

## 🔄 Data Flow

### 1. **Authentication**
```
Local App → Cognito User Pool → JWT Token → Identity Pool → AWS Credentials
```

### 2. **Audio Processing (Direct)**
```
Selected Audio Device → sox → DirectTranscribeClient → AWS Transcribe Streaming
                                                    ↓
Portuguese Text ← Real-time Results ←──────────────┘
              ↓
TranslationService → AWS Translate → Multi-language Translations
                                  ↓
Local UI Display → Language Tabs → Real-time Updates
```

### 3. **Audio Level Monitoring**
```
Audio Capture → VU Meter Events → IPC → UI Visualization
```

## 💰 Cost Analysis

### **Local Architecture Benefits**
- **AWS Transcribe**: $0.024/minute (only when speaking)
- **AWS Translate**: $15 per million characters
- **Cognito**: Free tier covers typical usage
- **No Server Costs**: No Lambda, API Gateway, or EC2 charges
- **No Timeout Limits**: Stream indefinitely

**Total Cost**: ~$0.024/minute + translation costs only

### **Comparison with Server-based Solutions**
- **60-80% cost reduction**: No server infrastructure
- **No cold starts**: Direct SDK connections
- **Unlimited duration**: No Lambda timeout restrictions
- **Lower latency**: Direct connection to AWS services

## 🔒 Security Model

### **Authentication Flow**
1. Admin logs in via Cognito User Pool → JWT token
2. JWT token stored securely using Electron safeStorage
3. JWT token exchanged for AWS credentials via Identity Pool
4. Direct AWS service calls with temporary credentials

### **Data Protection**
- **Encrypted storage**: JWT tokens encrypted with 24-hour expiration
- **HTTPS**: All AWS communications encrypted in transit
- **No audio storage**: Audio processed in real-time, not persisted
- **Local processing**: No data leaves the machine except for AWS API calls

## 🚀 Performance Characteristics

### **Real-time Processing**
- **Latency**: ~200-500ms end-to-end (audio → translation)
- **Audio Quality**: Supports multiple sample rates and input devices
- **Visual Feedback**: VU meter provides immediate audio level confirmation
- **Automatic Recovery**: Handles transcription timeouts gracefully

### **Device Support**
- **Built-in Microphones**: MacBook Pro internal microphone
- **Bluetooth Devices**: Wireless headsets and microphones
- **USB Devices**: External microphones and audio interfaces
- **System Integration**: Uses macOS CoreAudio for device enumeration

## 🔧 Implementation Details

### **Audio Capture Pipeline**
```typescript
// Device selection and sox integration
const soxCommand = audioDevice === 'default' 
  ? 'sox -t coreaudio default'
  : `sox -t coreaudio "${audioDevice}"`;
```

### **Credential Management**
```typescript
// Secure 24-hour credential storage
const credentials: StoredCredentials = {
  username,
  token,
  expiresAt: Date.now() + (24 * 60 * 60 * 1000)
};
const encrypted = safeStorage.encryptString(JSON.stringify(credentials));
```

### **UI Architecture**
- **Tabbed Interface**: Configuration and translation views
- **Real-time Updates**: IPC communication for live data
- **Responsive Design**: Adapts to different screen sizes
- **Accessibility**: Keyboard navigation and screen reader support

## 📊 Monitoring & Observability

### **Local Monitoring**
- **Audio Levels**: Real-time VU meter visualization
- **Connection Status**: Visual indicators for AWS service connectivity
- **Error Handling**: User-friendly error messages and recovery suggestions
- **Performance Metrics**: Local logging of transcription and translation times

### **AWS Service Monitoring**
- **CloudWatch Logs**: Automatic logging from AWS SDK calls
- **Service Quotas**: Monitor usage against AWS service limits
- **Cost Tracking**: AWS Cost Explorer for usage analysis

## 🔄 Future Enhancements

### **Planned Features**
1. **Additional Languages**: Expand source language support beyond Portuguese
2. **Custom Terminology**: Domain-specific translation improvements
3. **Recording Capability**: Optional session recording for review
4. **Batch Processing**: Process pre-recorded audio files

### **Technical Improvements**
1. **Audio Processing**: Advanced noise reduction and audio enhancement
2. **Offline Mode**: Local translation models for basic functionality
3. **Multi-platform**: Windows and Linux support
4. **Cloud Sync**: Optional cloud storage for session history

This architecture provides optimal cost-effectiveness and performance for individual users who need real-time audio translation without the complexity of server infrastructure.
