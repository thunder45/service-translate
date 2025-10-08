# WebSocket Message Protocols

This document defines the message protocols for the Service Translate local WebSocket server.

## Message Format

All messages follow a consistent JSON format:

```json
{
  "type": "message-type",
  "sessionId": "CHURCH-YYYY-NNN",
  "...additional fields"
}
```

## Session ID Format

Session IDs follow the pattern: `CHURCH-YYYY-NNN`
- `CHURCH`: Fixed prefix
- `YYYY`: 4-digit year
- `NNN`: 3-digit sequential number (001, 002, etc.)

Examples: `CHURCH-2025-001`, `CHURCH-2025-042`

## Admin Messages (Admin App → Server)

### Start Session
Creates a new translation session.

```json
{
  "type": "start-session",
  "sessionId": "CHURCH-2025-001",
  "config": {
    "sessionId": "CHURCH-2025-001",
    "targetLanguages": ["en", "es", "fr", "de", "it"],
    "ttsMode": "neural" | "standard" | "local" | "disabled",
    "audioQuality": "high" | "medium" | "low"
  }
}
```

**Response:** `session-started`

### End Session
Ends an active translation session (admin only).

```json
{
  "type": "end-session",
  "sessionId": "CHURCH-2025-001"
}
```

**Response:** `session-ended` (broadcast to all clients in session)

### Config Update
Updates session configuration during active session.

```json
{
  "type": "config-update",
  "sessionId": "CHURCH-2025-001",
  "config": {
    "sessionId": "CHURCH-2025-001",
    "targetLanguages": ["en", "es"],
    "ttsMode": "standard",
    "audioQuality": "medium"
  }
}
```

**Response:** `config-updated` (broadcast to all clients)

### Translation Broadcast
Sends translation to clients using specific language.

```json
{
  "type": "translation",
  "sessionId": "CHURCH-2025-001",
  "text": "Welcome to our service",
  "language": "en",
  "timestamp": 1704067200000,
  "audioUrl": "http://localhost:3001/audio/abc123.mp3",
  "useLocalTTS": false
}
```

**Response:** Message broadcast to language-specific clients

## Client Messages (Client App → Server)

### Join Session
Client joins an existing session.

```json
{
  "type": "join-session",
  "sessionId": "CHURCH-2025-001",
  "preferredLanguage": "en",
  "audioCapabilities": {
    "supportsPolly": true,
    "localTTSLanguages": ["en", "es"],
    "audioFormats": ["mp3", "wav", "ogg"]
  }
}
```

**Response:** `session-joined` with session metadata

### Leave Session
Client leaves the session.

```json
{
  "type": "leave-session",
  "sessionId": "CHURCH-2025-001"
}
```

**Response:** `session-left`

### Session Ended
Broadcast to all clients when admin ends the session.

```json
{
  "type": "session-ended",
  "sessionId": "CHURCH-2025-001",
  "timestamp": "2025-01-08T19:00:00.000Z"
}
```

**Client Action:** Disconnect from session, show "Session ended" message

### Change Language
Client changes preferred language.

```json
{
  "type": "change-language",
  "sessionId": "CHURCH-2025-001",
  "newLanguage": "es"
}
```

**Response:** `language-changed`

## Server Responses (Server → Client/Admin)

### Session Started
Confirms session creation (to admin).

```json
{
  "type": "session-started",
  "sessionId": "CHURCH-2025-001",
  "config": { /* session config */ },
  "timestamp": "2025-01-06T10:30:00.000Z"
}
```

### Session Joined
Confirms client joined session with metadata.

```json
{
  "type": "session-metadata",
  "config": {
    "sessionId": "CHURCH-2025-001",
    "targetLanguages": ["en", "es", "fr"],
    "ttsMode": "neural",
    "audioQuality": "high"
  },
  "availableLanguages": ["en", "es", "fr"],
  "ttsAvailable": true,
  "audioQuality": "high"
}
```

### Translation Message
Translation sent to clients (language-specific).

```json
{
  "type": "translation",
  "sessionId": "CHURCH-2025-001",
  "text": "Bienvenidos a nuestro servicio",
  "language": "es",
  "timestamp": 1704067200000,
  "audioUrl": "http://localhost:3001/audio/def456.mp3",
  "useLocalTTS": false
}
```

### Config Updated
Notifies clients of configuration changes.

```json
{
  "type": "config-updated",
  "sessionId": "CHURCH-2025-001",
  "config": { /* updated config */ },
  "timestamp": "2025-01-06T10:35:00.000Z"
}
```

### Error Message
Error response for invalid requests.

```json
{
  "type": "error",
  "code": 400,
  "message": "Invalid session ID format. Expected: CHURCH-YYYY-NNN",
  "details": {
    "sessionId": "invalid-id"
  }
}
```

## Connection Events

### Connected
Welcome message sent on connection.

```json
{
  "message": "Connected to Service Translate WebSocket Server",
  "socketId": "abc123def456",
  "timestamp": "2025-01-06T10:30:00.000Z"
}
```

### Ping/Pong
Health check mechanism.

**Client sends:** `ping`
**Server responds:** 
```json
{
  "timestamp": "2025-01-06T10:30:00.000Z"
}
```

## Language-Specific Broadcasting

The server maintains language-specific client groups for efficient broadcasting:

1. **Admin sends translation** for language "es"
2. **Server identifies clients** with `preferredLanguage: "es"`
3. **Server broadcasts** only to those clients
4. **Other language clients** don't receive the message

## Error Codes

- **400**: Bad Request (invalid message format, validation failed)
- **404**: Not Found (session doesn't exist)
- **500**: Internal Server Error

## Message Validation

All messages are validated for:
- **Type**: Must be a recognized message type
- **Session ID**: Must match `CHURCH-YYYY-NNN` pattern
- **Languages**: Must be one of `en`, `es`, `fr`, `de`, `it`
- **TTS Mode**: Must be `neural`, `standard`, `local`, or `disabled`
- **Audio Quality**: Must be `high`, `medium`, or `low`
- **Required Fields**: All required fields must be present and valid

## Example Client Flow

1. **Connect** to WebSocket server
2. **Receive** welcome message
3. **Send** `join-session` message
4. **Receive** `session-metadata` response
5. **Receive** `translation` messages for preferred language
6. **Send** `change-language` to switch languages
7. **Send** `leave-session` when done

## Example Admin Flow

1. **Connect** to WebSocket server
2. **Send** `start-session` message
3. **Receive** `session-started` confirmation
4. **Send** `broadcast-translation` messages
5. **Send** `config-update` to change settings
6. **Monitor** client connections via health endpoint

## Testing

Use the included test client:

```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Run test client
npm test
```

The test client demonstrates the complete message flow for both admin and client operations.