# Session Management vs Streaming Separation

## 🎯 Architecture Principle

The capture application maintains a **strict separation** between two independent concerns:

1. **Session Management** - WebSocket session lifecycle
2. **Audio Streaming** - Transcription and translation processing

These are **completely independent** operations that can be controlled separately.

## 🏗️ Component Responsibilities

### Session Management (WebSocket Layer)

**Purpose:** Manage TTS server sessions for client broadcasting

**Components:**
- `WebSocketManager` - Session lifecycle and WebSocket communication
- Session Management UI Widget - Create, list, reconnect, end sessions

**Operations:**
```typescript
// Session lifecycle - independent of streaming
await webSocketManager.createSession(sessionId, config);
await webSocketManager.endSession();
await webSocketManager.listSessions();
await webSocketManager.reconnectToSession(sessionId);
```

**UI Controls:**
- Session ID input field
- "🚀 Create Session" button
- "🛑 End Session" button
- Sessions list with "↻ Reconnect" and "✕ End" buttons
- "🔄 Refresh" button

### Audio Streaming (Transcription Layer)

**Purpose:** Capture audio and process transcription/translation

**Components:**
- `DirectStreamingManager` - Audio capture and AWS service orchestration
- `DirectTranscribeClient` - AWS Transcribe Streaming
- `TranslationService` - AWS Translate
- `AudioCapture` - Microphone input

**Operations:**
```typescript
// Streaming lifecycle - independent of sessions
await streamingManager.startStreaming();
await streamingManager.stopStreaming();
```

**UI Controls:**
- "🎤 Start Streaming" button
- "⏹️ Stop Streaming" button
- VU meter visualization
- Language tabs for translations

## 🔄 Independent Lifecycles

### Valid State Combinations

| Streaming | Session | Description |
|-----------|---------|-------------|
| ❌ Stopped | ❌ No Session | Initial state - nothing active |
| ❌ Stopped | ✅ Session Active | Session created but not streaming yet |
| ✅ Active | ❌ No Session | Streaming locally without broadcasting |
| ✅ Active | ✅ Session Active | Full operation - streaming + broadcasting |

### Example Workflows

#### Workflow 1: Create Session First
```
1. User clicks "Create Session" → Session created on TTS server
2. User clicks "Start Streaming" → Audio capture begins
3. Translations broadcast to session clients
4. User clicks "Stop Streaming" → Audio stops, session remains
5. User clicks "End Session" → Session terminated
```

#### Workflow 2: Stream Without Session
```
1. User clicks "Start Streaming" → Audio capture begins
2. Translations display locally only (no broadcasting)
3. User clicks "Stop Streaming" → Audio stops
```

#### Workflow 3: Manual Session Selection
```
1. User connects to WebSocket server
2. User clicks "Refresh" in sessions list to view active sessions
3. User manually selects session to reconnect or creates new one
4. User clicks "Start Streaming" → Begin broadcasting
```

**Note:** Auto-reconnect to previous session has been removed. Users must manually select sessions from the active sessions list.

## 📋 Implementation Details

### DirectStreamingManager.startStreaming()

**Does:**
- ✅ Start AWS Transcribe streaming
- ✅ Start audio capture from microphone
- ✅ Emit `streaming-started` event

**Does NOT:**
- ❌ Create WebSocket session
- ❌ Connect to TTS server
- ❌ Manage session lifecycle

```typescript
async startStreaming(): Promise<void> {
  if (this.isActive) return;

  try {
    console.log('Starting local streaming...');
    
    // Start transcription stream
    await this.transcribeClient.startStreaming();
    
    // Start audio capture
    await this.audioCapture.start();
    
    this.isActive = true;
    this.emit('streaming-started');
    
    console.log('Local streaming started successfully');
  } catch (error) {
    console.error('Failed to start streaming:', error);
    this.emit('error', { type: 'startup', error: (error as Error).message });
    throw error;
  }
}
```

### DirectStreamingManager.stopStreaming()

**Does:**
- ✅ Stop audio capture
- ✅ Stop AWS Transcribe streaming
- ✅ Clear Holyrics display (if enabled)
- ✅ Emit `streaming-stopped` event

**Does NOT:**
- ❌ End WebSocket session
- ❌ Disconnect from TTS server
- ❌ Clear session state

```typescript
async stopStreaming(): Promise<void> {
  if (!this.isActive) return;

  try {
    console.log('Stopping local streaming...');
    
    // Clear Holyrics display
    if (this.holyricsIntegration) {
      try {
        await this.holyricsIntegration.clear();
      } catch (error) {
        console.error('Failed to clear Holyrics:', error);
      }
    }
    
    // Stop audio capture first
    await this.audioCapture.stop();
    
    // Stop transcription stream
    await this.transcribeClient.stopStreaming();
    
    this.isActive = false;
    this.emit('streaming-stopped');
    
    console.log('Local streaming stopped successfully');
  } catch (error) {
    console.error('Failed to stop streaming:', error);
    this.emit('error', { type: 'shutdown', error: (error as Error).message });
  }
}
```

### Session Management Methods (Separate)

These methods exist in `DirectStreamingManager` but are **never called** by `startStreaming()` or `stopStreaming()`:

```typescript
// Session lifecycle - called only from UI Session Management widget
async createSession(sessionId: string): Promise<void> {
  if (!this.webSocketManager) {
    throw new Error('WebSocket manager not initialized');
  }

  const sessionConfig: SessionConfig = {
    sessionId,
    enabledLanguages: this.mapToTargetLanguages(this.config.targetLanguages),
    ttsMode: this.config.tts.mode,
    audioQuality: this.config.tts.mode === 'neural' ? 'high' : 'medium'
  };

  await this.webSocketManager.createSession(sessionId, sessionConfig);
}

async endSession(): Promise<void> {
  if (this.webSocketManager) {
    await this.webSocketManager.endSession();
  }
}

getCurrentSession(): SessionConfig | null {
  return this.webSocketManager?.getCurrentSession() || null;
}
```

## 🎨 UI Layout

### Audio Capture Panel
```
┌─────────────────────────────────────┐
│ 🎤 Audio Capture & Translation      │
├─────────────────────────────────────┤
│ [🎤 Start Streaming] [⏹️ Stop]      │
│                                     │
│ Source Language: 🇧🇷 Portuguese     │
│ Target Languages: ☑️ EN ☑️ ES ☑️ FR │
└─────────────────────────────────────┘
```

### Session Management Panel (Separate)
```
┌─────────────────────────────────────────────────────┐
│ 📡 Session Management                               │
├─────────────────────────────────────────────────────┤
│ Current Session: CHURCH-20251008-2100              │
│                                    [🔄 Refresh]     │
├─────────────────────────────────────────────────────┤
│ Active Sessions:                                    │
│ ┌─────────────────────────────────────────────────┐│
│ │ CHURCH-20251008-2100                    [ADMIN] ││
│ │ 3 clients • neural • started                    ││
│ │              [↻ Reconnect] [✕ End]              ││
│ └─────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────┤
│ Session ID: [CHURCH-2025-001] [🚀 Create Session]  │
│                               [🛑 End Session]      │
└─────────────────────────────────────────────────────┘
```

## 🔗 Data Flow

### Translation Broadcasting (When Both Active)

```
Microphone
    ↓
AudioCapture (streaming layer)
    ↓
DirectTranscribeClient → AWS Transcribe
    ↓
TranscriptionResult
    ↓
TranslationService → AWS Translate
    ↓
TranslationResults
    ↓
    ├─→ Local UI Display (always)
    │
    └─→ WebSocketManager (if session active)
            ↓
        TTS Server
            ↓
        Connected Clients
```

### Key Points:
- **Streaming** produces translations regardless of session state
- **Session** determines if translations are broadcast to clients
- **Local display** always shows translations when streaming
- **Broadcasting** only happens when both streaming AND session are active

## ✅ Benefits of Separation

1. **Flexibility**: Stream locally without creating a session
2. **Session Reuse**: Keep session alive between streaming sessions
3. **Testing**: Test streaming without affecting live sessions
4. **Recovery**: Reconnect to sessions without restarting streaming
5. **Independence**: Session failures don't stop streaming
6. **Clarity**: Clear UI separation matches implementation

## 🚫 Anti-Patterns (Avoided)

❌ **Don't:** Auto-create session when starting streaming
❌ **Don't:** Auto-end session when stopping streaming
❌ **Don't:** Mix session logic in streaming methods
❌ **Don't:** Require session to exist before streaming
❌ **Don't:** Couple session state with streaming state

## 📝 Summary

The architecture maintains **complete independence** between:
- **What you capture** (streaming)
- **Where you broadcast** (session)

This separation provides maximum flexibility and aligns perfectly with the UI design where session management and streaming controls are in separate panels with distinct responsibilities.
