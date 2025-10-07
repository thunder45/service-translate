# TTS Server Architecture

## Overview
The TTS Server (formerly WebSocket Server) now handles AWS Polly TTS generation, moving this responsibility from the capture app for better separation of concerns.

## Architecture Flow

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
│      │  (Optional)  │              │  (WebSocket) │    │
│      └──────────────┘              └──────┬───────┘    │
└─────────────────────────────────────────────┼──────────┘
                                              │
                    ┌─────────────────────────┼─────────────────────┐
                    │                         │                     │
                    ▼                         ▼                     ▼
            ┌──────────────┐        ┌──────────────┐      ┌──────────────┐
            │ PWA Client 1 │        │ PWA Client 2 │      │ PWA Client N │
            │ (Phone/Web)  │        │ (Tablet/Web) │      │ (Laptop/Web) │
            └──────────────┘        └──────────────┘      └──────────────┘
```

## Components

### 1. Capture App (Simplified)
**Responsibilities:**
- Audio capture from microphone
- AWS Transcribe streaming (Portuguese → Text)
- AWS Translate (Portuguese → 5 languages)
- Send translations to Holyrics (optional)
- Send translations to TTS Server

**Removed:**
- AWS Polly client
- Local audio file management
- TTS generation logic

**New Method:**
```typescript
await webSocketManager.sendTranslations({
  original: "Bom dia",
  translations: {
    en: "Good morning",
    es: "Buenos días",
    fr: "Bonjour",
    de: "Guten Morgen",
    it: "Buongiorno"
  },
  generateTTS: true,
  voiceType: 'neural'
});
```

### 2. TTS Server (Enhanced)
**New Responsibilities:**
- AWS Polly client with Cognito authentication
- Generate audio on-demand when receiving translations
- Store audio files in local cache
- Serve audio files via HTTP

**Existing Responsibilities:**
- WebSocket server for real-time communication
- Session management
- Client connection handling
- Message routing

**New Component: PollyService**
```typescript
class PollyService {
  async generateAudio(text: string, language: string, voiceType: 'neural' | 'standard'): Promise<Buffer | null>
  isEnabled(): boolean
  updateCredentials(jwtToken: string): void
}
```

**Configuration:**
```bash
# Environment variables
ENABLE_TTS=true                    # Enable/disable TTS generation
AWS_REGION=us-east-1
AWS_IDENTITY_POOL_ID=us-east-1:xxx
AWS_USER_POOL_ID=us-east-1_xxx
AWS_JWT_TOKEN=eyJxxx...            # Optional: for server-side auth
```

### 3. PWA Clients (Enhanced)
**Capabilities:**
- Receive translations with or without audio
- Choose between server-generated audio or local TTS
- Fallback to text-only if TTS unavailable

**Message Format:**
```typescript
{
  type: 'translation',
  sessionId: 'CHURCH-2025-001',
  original: 'Bom dia',
  text: 'Good morning',
  language: 'en',
  timestamp: 1234567890,
  audioUrl: 'http://localhost:3001/audio/abc123.mp3',  // null if TTS disabled/failed
  audioMetadata: {
    audioId: 'abc123',
    duration: 2.5,
    format: 'mp3',
    voiceType: 'neural',
    size: 45678
  },
  ttsAvailable: true
}
```

## TTS Modes

### 1. Server TTS (Neural/Standard)
- **generateTTS: true**
- Server calls AWS Polly
- Clients receive audio URL
- High quality, costs apply

### 2. Local TTS
- **generateTTS: false**
- Clients use Web Speech API
- Free, works offline
- Quality varies by browser

### 3. Disabled
- **generateTTS: false**
- Text-only mode
- No audio generated
- Zero TTS costs

## Benefits

### 1. Simpler Capture App
- No TTS complexity
- Faster startup
- Easier to maintain
- Focus on transcription/translation

### 2. Centralized TTS
- One place for Polly logic
- Easier cost tracking
- Better error handling
- Shared audio cache

### 3. Flexible Deployment
- TTS Server can run on different machine
- Multiple capture apps can share one TTS Server
- Scale TTS independently

### 4. Better Client Experience
- Clients choose audio source
- Graceful fallback to local TTS
- Works even if Polly fails

## Migration Path

### Phase 1: Add TTS to Server ✅
- [x] Create PollyService
- [x] Add Polly client initialization
- [x] Add audio generation logic
- [x] Update server configuration

### Phase 2: Update Message Flow ✅
- [x] Add broadcast-translation handler
- [x] Generate audio on-demand
- [x] Update message router
- [x] Add sendTranslations to WebSocketManager

### Phase 3: Update Capture App ✅
- [x] Remove local TTS generation
- [x] Send translations to server
- [x] Keep Holyrics integration

### Phase 4: Testing (Next)
- [ ] Test with TTS enabled
- [ ] Test with TTS disabled
- [ ] Test Polly failure scenarios
- [ ] Test client audio selection

### Phase 5: Cleanup (Future)
- [ ] Remove unused TTS code from capture app
- [ ] Update documentation
- [ ] Add cost tracking to server
- [ ] Add TTS analytics

## Configuration Examples

### Development (TTS Disabled)
```bash
# TTS Server
ENABLE_TTS=false

# Capture App
tts: {
  mode: 'local',  // Clients use local TTS
  websocketUrl: 'ws://localhost:3001'
}
```

### Production (TTS Enabled)
```bash
# TTS Server
ENABLE_TTS=true
AWS_REGION=us-east-1
AWS_IDENTITY_POOL_ID=us-east-1:xxx
AWS_USER_POOL_ID=us-east-1_xxx
AWS_JWT_TOKEN=eyJxxx...

# Capture App
tts: {
  mode: 'neural',  // Server generates neural TTS
  websocketUrl: 'ws://localhost:3001'
}
```

### Hybrid (Optional TTS)
```bash
# TTS Server
ENABLE_TTS=true
# ... AWS credentials

# Capture App
tts: {
  mode: 'standard',  // Server generates standard TTS
  websocketUrl: 'ws://localhost:3001'
}

# Clients can still choose local TTS if they prefer
```

## Error Handling

### Polly Failure
1. Server logs error
2. Returns null audio
3. Sends translation with `audioUrl: null`
4. Client falls back to local TTS or text-only

### Server Disconnection
1. Capture app detects disconnect
2. Continues transcription/translation
3. Sends to Holyrics only
4. Reconnects automatically when server available

### Client Audio Failure
1. Client tries server audio
2. If fails, tries local TTS
3. If fails, shows text only
4. User notified of audio unavailability
