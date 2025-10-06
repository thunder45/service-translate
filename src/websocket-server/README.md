# Service Translate WebSocket Server

Local WebSocket server for real-time communication between the admin application and client devices.

## Features

- **Session Management**: Human-readable session IDs (e.g., "CHURCH-2025-001")
- **Client Tracking**: Track connected clients and their language preferences
- **Language-Specific Broadcasting**: Send translations only to clients using specific languages
- **Session Persistence**: Sessions are saved to local JSON files for recovery
- **Automatic Cleanup**: Inactive sessions are cleaned up after 24 hours

## Installation

```bash
npm install
npm run build
```

## Usage

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

### Build Only
```bash
npm run build
```

## Configuration

The server runs on port 3001 by default. You can change this by setting the `PORT` environment variable:

```bash
PORT=8080 npm start
```

## API Endpoints

### Health Check
- **GET** `/health` - Returns server status and active sessions

### WebSocket Events

#### Admin Events (sent by admin application)
- `start-session` - Create a new translation session
- `config-update` - Update session configuration
- `broadcast-translation` - Send translation to specific language group

#### Client Events (sent by client applications)
- `join-session` - Join an existing session
- `leave-session` - Leave a session
- `change-language` - Change preferred language

#### Server Events (sent to clients)
- `connected` - Welcome message on connection
- `session-joined` - Confirmation of joining session with metadata
- `translation` - New translation message
- `config-updated` - Session configuration changed

## Session Persistence

Sessions are automatically saved to `./sessions/` directory as JSON files. This allows:
- Recovery after server restart
- Debugging session state
- Audit trail of session activity

## Development

The server is built with:
- **Express.js** - HTTP server
- **Socket.IO** - WebSocket communication
- **TypeScript** - Type safety
- **Local file system** - Session persistence

## Monitoring

Check server health and active sessions:
```bash
curl http://localhost:3001/health
```

Example response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-06T10:30:00.000Z",
  "connections": 5,
  "activeSessions": 1,
  "sessions": [
    {
      "sessionId": "CHURCH-2025-001",
      "status": "active",
      "clientCount": 4,
      "createdAt": "2025-01-06T10:00:00.000Z"
    }
  ]
}
```