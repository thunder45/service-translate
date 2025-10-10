# TTS Client Application - Design Document

## Overview

This design extends Service Translate with text-to-speech capabilities and a Progressive Web Application (PWA) for congregation members. The system adds AWS Polly integration to the existing local architecture while maintaining the cost-effective direct streaming approach. A new WebSocket-based communication layer enables real-time distribution of translations and audio to multiple client devices.

## Architecture

### High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Service Translate Enhanced                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐    Direct AWS SDK    ┌─────────────────┐              │
│  │   Admin App     │ ──────────────────► │ AWS Transcribe  │              │
│  │ (Electron)      │                     │   Streaming     │              │
│  │                 │                     └─────────────────┘              │
│  │                 │                              │                        │
│  │                 │    Direct AWS SDK    ┌───────▼─────────┐              │
│  │                 │ ◄────────────────────│ AWS Translate   │              │
│  │                 │                      └─────────────────┘              │
│  │                 │                              │                        │
│  │                 │    Direct AWS SDK    ┌───────▼─────────┐              │
│  │                 │ ◄────────────────────│ AWS Polly       │              │
│  │                 │                      │ (TTS)           │              │
│  │                 │                      └─────────────────┘              │
│  │                 │                                                       │
│  │  ┌─────────────┐│          WebSocket           ┌─────────────────────┐  │
│  │  │ Session     ││ ◄─────────────────────────► │ WebSocket Server    │  │
│  │  │ Manager     ││                             │ (Node.js/Socket.IO) │  │
│  │  └─────────────┘│                             └─────────────────────┘  │
│  └─────────────────┘                                       │               │
│                                                            │               │
│                                          WebSocket         │               │
│                                       ┌─────────────────────▼─────────────┐ │
│                                       │                                   │ │
│  ┌─────────────────┐                  │        Client PWA Network        │ │
│  │   Client PWA    │ ◄────────────────┤                                   │ │
│  │ (Mobile/Web)    │                  │  ┌─────────────────┐              │ │
│  │                 │                  │  │   Client PWA    │              │ │
│  │ ┌─────────────┐ │                  │  │ (Mobile/Web)    │              │ │
│  │ │Local TTS    │ │                  │  │                 │              │ │
│  │ │(Fallback)   │ │                  │  │ ┌─────────────┐ │              │ │
│  │ └─────────────┘ │                  │  │ │Local TTS    │ │              │ │
│  └─────────────────┘                  │  │ │(Fallback)   │ │              │ │
│                                       │  │ └─────────────┘ │              │ │
│                                       │  └─────────────────┘              │ │
│                                       │                                   │ │
│                                       │         ... up to 50 clients     │ │
│                                       └───────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

#### 1. Enhanced Admin Application (Electron)
- **Existing Components**: Audio capture, AWS Transcribe/Translate integration
- **New TTS Manager**: AWS Polly integration with voice selection
- **New Session Manager**: WebSocket client for broadcasting translations
- **New Cost Tracker**: Real-time monitoring of AWS service usage
- **New Language Controller**: Dynamic language subset selection

#### 2. WebSocket Communication Server (New)
- **Technology**: Node.js with Socket.IO for real-time communication
- **Session Management**: Human-readable session IDs and client tracking
- **Message Broadcasting**: Efficient distribution to language-specific client groups
- **Reconnection Handling**: Automatic recovery for both admin and clients

#### 3. Progressive Web Application (New)
- **Technology**: Vanilla JavaScript PWA with Service Worker
- **Local TTS Integration**: Web Speech API for device-native TTS
- **Responsive Design**: Mobile-first with fullscreen support
- **Offline Capability**: Basic functionality without network connection

## Components and Interfaces

### Admin Application Enhancements

#### TTS Manager Component
```typescript
interface TTSManager {
  // Configuration
  setTTSMode(mode: 'neural' | 'standard' | 'local' | 'disabled'): void;
  setEnabledLanguages(languages: TargetLanguage[]): void;
  
  // Audio Generation
  generateAudio(text: string, language: TargetLanguage): Promise<AudioBuffer>;
  
  // Cost Tracking
  trackPollyUsage(characters: number, voiceType: 'neural' | 'standard'): void;
  getCurrentCosts(): ServiceCosts;
}

interface ServiceCosts {
  transcribe: { minutes: number; cost: number };
  translate: { characters: number; cost: number };
  polly: { characters: number; cost: number; voiceType: string };
  total: number;
  hourlyRate: number;
}
```

#### Session Manager Component
```typescript
interface SessionManager {
  // Session Control
  createSession(sessionId: string, config: SessionConfig): Promise<void>;
  joinSession(sessionId: string): Promise<void>;
  endSession(): Promise<void>;
  
  // Broadcasting
  broadcastTranslation(translation: TranslationMessage): void;
  broadcastAudio(audio: AudioMessage): void;
  broadcastConfigUpdate(config: SessionConfig): void;
  
  // Client Management
  getConnectedClients(): ClientInfo[];
  getClientsByLanguage(language: TargetLanguage): ClientInfo[];
}

interface SessionConfig {
  sessionId: string;
  enabledLanguages: TargetLanguage[];
  ttsMode: 'neural' | 'standard' | 'local' | 'disabled';
  audioQuality: 'high' | 'medium' | 'low';
}
```

### WebSocket Server Architecture

#### Message Types
```typescript
// Admin to Server Messages
interface StartSessionMessage {
  type: 'start-session';
  sessionId: string;
  config: SessionConfig;
}

interface TranslationBroadcast {
  type: 'translation';
  sessionId: string;
  text: string;
  language: TargetLanguage;
  timestamp: number;
  audioUrl?: string; // Optional Polly-generated audio URL
}

interface ConfigUpdateMessage {
  type: 'config-update';
  sessionId: string;
  config: SessionConfig;
}

// Client to Server Messages
interface JoinSessionMessage {
  type: 'join-session';
  sessionId: string;
  preferredLanguage: TargetLanguage;
}

interface LanguageChangeMessage {
  type: 'change-language';
  sessionId: string;
  newLanguage: TargetLanguage;
}

// Server to Client Messages
interface SessionMetadataMessage {
  type: 'session-metadata';
  config: SessionConfig;
  availableLanguages: TargetLanguage[];
  ttsAvailable: boolean;
  audioQuality: string;
}

interface TranslationMessage {
  type: 'translation';
  text: string;
  language: TargetLanguage;
  timestamp: number;
  audioUrl?: string;
  useLocalTTS?: boolean;
}
```

#### Server Implementation Structure
```typescript
class TranslationWebSocketServer {
  private io: SocketIO.Server;
  private sessions: Map<string, SessionData>;
  private clients: Map<string, ClientData>;
  
  // Session Management
  createSession(sessionId: string, config: SessionConfig): void;
  updateSessionConfig(sessionId: string, config: SessionConfig): void;
  
  // Client Management
  handleClientJoin(socket: Socket, message: JoinSessionMessage): void;
  handleLanguageChange(socket: Socket, message: LanguageChangeMessage): void;
  
  // Broadcasting
  broadcastToLanguageGroup(sessionId: string, language: TargetLanguage, message: any): void;
  broadcastConfigUpdate(sessionId: string, config: SessionConfig): void;
}
```

### Progressive Web Application

#### PWA Architecture
```typescript
// Main Application Controller
class TranslationClientApp {
  private socket: SocketIO.Socket;
  private audioPlayer: AudioPlayer;
  private localTTS: LocalTTSService;
  private displayManager: DisplayManager;
  
  // Session Management
  joinSession(sessionId: string): Promise<void>;
  reconnectToSession(): Promise<void>;
  
  // Language Management
  changeLanguage(language: TargetLanguage): void;
  updateAvailableLanguages(languages: TargetLanguage[]): void;
  
  // Audio Control
  toggleMute(): void;
  setVolume(level: number): void;
  
  // Display Control
  updateDisplaySettings(settings: DisplaySettings): void;
}

// Local TTS Service
class LocalTTSService {
  private speechSynthesis: SpeechSynthesis;
  private availableVoices: Map<TargetLanguage, SpeechSynthesisVoice[]>;
  
  // Voice Management
  loadAvailableVoices(): Promise<void>;
  getBestVoiceForLanguage(language: TargetLanguage): SpeechSynthesisVoice | null;
  
  // Speech Generation
  speak(text: string, language: TargetLanguage, options: TTSOptions): Promise<void>;
  stop(): void;
  
  // Capability Detection
  isLanguageSupported(language: TargetLanguage): boolean;
  getVoiceQuality(language: TargetLanguage): 'high' | 'medium' | 'low' | 'none';
}
```

## Data Models

### Session Data Model
```typescript
interface SessionData {
  sessionId: string;
  adminId: string;                    // Persistent admin owner
  currentAdminSocketId: string | null; // Current admin connection
  createdBy: string;                  // Username for display
  config: SessionConfig;
  clients: Map<string, ClientData>;
  createdAt: Date;
  lastActivity: Date;
  costs: ServiceCosts;
}

interface ClientData {
  socketId: string;
  preferredLanguage: TargetLanguage;
  joinedAt: Date;
  lastSeen: Date;
  audioCapabilities: AudioCapabilities;
}

interface AudioCapabilities {
  supportsPolly: boolean;
  localTTSLanguages: TargetLanguage[];
  audioFormats: string[];
}
```

### Translation Data Model
```typescript
interface TranslationData {
  originalText: string;
  sourceLanguage: 'pt';
  translations: Map<TargetLanguage, string>;
  audioUrls: Map<TargetLanguage, string>; // Polly-generated URLs
  timestamp: Date;
  sessionId: string;
}

interface AudioData {
  language: TargetLanguage;
  text: string;
  audioUrl: string;
  voiceType: 'neural' | 'standard';
  duration: number;
  size: number;
}
```

### Configuration Data Model
```typescript
interface DisplaySettings {
  fontSize: 'small' | 'medium' | 'large' | 'extra-large';
  fontFamily: 'serif' | 'sans-serif' | 'monospace';
  backgroundColor: 'white' | 'black' | 'dark-gray' | 'light-gray';
  textColor: 'black' | 'white' | 'blue' | 'green';
  fullscreen: boolean;
}

interface AudioSettings {
  volume: number; // 0-100
  muted: boolean;
  preferredTTS: 'cloud' | 'local' | 'auto';
  voiceSpeed: number; // 0.5-2.0
}

interface ClientSettings {
  sessionId: string;
  preferredLanguage: TargetLanguage;
  display: DisplaySettings;
  audio: AudioSettings;
  autoReconnect: boolean;
}
```

## Error Handling

### TTS Fallback Chain
```typescript
class TTSFallbackManager {
  async generateAudio(text: string, language: TargetLanguage): Promise<AudioResult> {
    try {
      // Primary: AWS Polly
      if (this.config.ttsMode !== 'local') {
        return await this.pollyService.synthesize(text, language);
      }
    } catch (error) {
      console.warn('Polly TTS failed, falling back to local TTS:', error);
    }
    
    try {
      // Secondary: Local TTS
      return await this.localTTS.synthesize(text, language);
    } catch (error) {
      console.warn('Local TTS failed, using text-only:', error);
    }
    
    // Tertiary: Text-only
    return { type: 'text-only', text };
  }
}
```

### Connection Recovery
```typescript
class ConnectionManager {
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  
  async handleDisconnection(): Promise<void> {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      await this.delay(this.reconnectDelay);
      this.reconnectDelay *= 2; // Exponential backoff
      this.reconnectAttempts++;
      
      try {
        await this.reconnect();
        this.resetReconnectState();
      } catch (error) {
        await this.handleDisconnection(); // Recursive retry
      }
    } else {
      this.showOfflineMode();
    }
  }
}
```

## Testing Strategy

### Unit Testing
- **TTS Manager**: Test Polly integration, voice selection, cost calculation
- **Session Manager**: Test session creation, client management, broadcasting
- **Local TTS Service**: Test voice detection, synthesis, language support
- **Display Manager**: Test responsive design, accessibility features

### Integration Testing
- **Admin-Server Communication**: Test WebSocket message flow
- **Client-Server Communication**: Test real-time translation delivery
- **TTS Fallback Chain**: Test Polly → Local TTS → Text-only progression
- **Session Reconnection**: Test crash recovery for both admin and clients

### End-to-End Testing
- **Complete Translation Flow**: Portuguese audio → Text → Translation → TTS → Client delivery
- **Multi-Client Scenarios**: Test with 10, 25, and 50 concurrent clients
- **Language Switching**: Test dynamic language changes during active session
- **Cost Tracking**: Verify accurate cost calculation across all services

### Performance Testing
- **Audio Latency**: Measure time from text to audio playback (target: <2 seconds)
- **WebSocket Throughput**: Test message delivery with multiple concurrent clients
- **Memory Usage**: Monitor client PWA memory consumption during long sessions
- **Bandwidth Usage**: Measure data consumption for different TTS modes

### Accessibility Testing
- **Screen Reader Compatibility**: Test with VoiceOver (iOS) and TalkBack (Android)
- **High Contrast Mode**: Verify display settings work with system accessibility
- **Font Scaling**: Test with system font size adjustments
- **Keyboard Navigation**: Ensure full functionality without touch input

## Deployment Architecture

### Infrastructure Components
```
┌─────────────────────────────────────────────────────────────────┐
│                     AWS Infrastructure                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ Cognito         │  │ Transcribe      │  │ Translate       │ │
│  │ (Auth)          │  │ (Speech-to-Text)│  │ (Translation)   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐                      │
│  │ Polly           │  │ S3 Bucket       │                      │
│  │ (Text-to-Speech)│  │ (Audio Cache)   │                      │
│  └─────────────────┘  └─────────────────┘                      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   Local/Cloud Hybrid                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐                      │
│  │ Admin App       │  │ WebSocket       │                      │
│  │ (Electron)      │  │ Server          │                      │
│  │ - Local         │  │ (Node.js)       │                      │
│  └─────────────────┘  └─────────────────┘                      │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐                      │
│  │ Client PWA      │  │ CDN/Static      │                      │
│  │ (Mobile/Web)    │  │ Hosting         │                      │
│  │ - Local TTS     │  │ (PWA Assets)    │                      │
│  └─────────────────┘  └─────────────────┘                      │
└─────────────────────────────────────────────────────────────────┘
```

### Deployment Options

#### Option 1: Fully Local (Recommended for Individual Use)
- **Admin App**: Local Electron application
- **WebSocket Server**: Local Node.js server (same machine as admin)
- **Client Access**: Local network only (church WiFi)
- **Benefits**: No hosting costs, maximum privacy, simple setup
- **Limitations**: Requires local network, limited to single location

#### Option 2: Hybrid Cloud (Recommended for Multi-Location)
- **Admin App**: Local Electron application
- **WebSocket Server**: Cloud-hosted (AWS EC2 or similar)
- **Client Access**: Internet-accessible PWA
- **Benefits**: Remote access, multiple locations, scalable
- **Costs**: ~$10-20/month for small EC2 instance + bandwidth

#### Option 3: Serverless Cloud (Future Enhancement)
- **Admin App**: Web-based admin interface
- **WebSocket Server**: AWS API Gateway WebSocket + Lambda
- **Client Access**: Global CDN-distributed PWA
- **Benefits**: Auto-scaling, global availability, no server management
- **Costs**: Pay-per-use, potentially higher for sustained usage

This design provides a robust, scalable solution that maintains the cost-effective direct AWS integration while adding powerful multi-client capabilities and flexible TTS options.