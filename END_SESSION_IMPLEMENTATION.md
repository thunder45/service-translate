# End Session Implementation

## Overview
Implemented `end-session` WebSocket primitive to allow admin to properly terminate active translation sessions.

## Changes Made

### 1. WebSocket Server (`src/websocket-server/`)

#### `message-router.ts`
- Added `case 'end-session'` to message router switch
- Implemented `handleEndSession()` method with:
  - Session existence validation
  - Admin authorization check (only session creator can end)
  - Broadcast `session-ended` to all clients
  - Remove all clients from Socket.IO room
  - Confirm to admin

#### `server.ts`
- Added `socket.on('end-session')` event listener
- Integrated with security middleware

#### `session-manager.ts`
- Already had `endSession()` method that:
  - Marks session status as 'ended'
  - Schedules cleanup after 1 hour
  - Persists state

### 2. Capture App (`src/capture/`)

#### `websocket-manager.ts`
- Fixed `endSession()` to emit `end-session` directly (was using `admin-message`)
- Clears current session state
- Emits local `session-ended` event

#### `main.ts`
- IPC handler `end-session` already existed
- Calls `streamingManager.endSession()`

#### `direct-streaming-manager.ts`
- `endSession()` already existed
- Delegates to `webSocketManager.endSession()`

### 3. Documentation

#### `MESSAGE_PROTOCOLS.md`
- Added `end-session` to admin messages section
- Added `session-ended` to server responses section

## Protocol

### Request (Admin → Server)
```json
{
  "sessionId": "CHURCH-2025-001"
}
```

### Response (Server → All Clients)
```json
{
  "type": "session-ended",
  "sessionId": "CHURCH-2025-001",
  "timestamp": "2025-01-08T19:00:00.000Z"
}
```

### Error Responses
- **404**: Session not found
- **403**: Only admin can end session (authorization check)
- **500**: Failed to end session

## Security

- ✅ Only session admin (creator) can end the session
- ✅ All clients are notified before disconnection
- ✅ Session data persisted with 'ended' status
- ✅ Automatic cleanup after 1 hour

## Usage Flow

1. **Admin calls end-session**:
   ```javascript
   socket.emit('end-session', { sessionId: 'CHURCH-2025-001' });
   ```

2. **Server validates**:
   - Session exists?
   - Caller is admin?

3. **Server broadcasts to all clients**:
   ```javascript
   io.to(sessionId).emit('session-ended', { ... });
   ```

4. **Server removes clients from room**:
   ```javascript
   io.in(sessionId).socketsLeave(sessionId);
   ```

5. **Session marked as ended**:
   - Status: 'ended'
   - Cleanup scheduled for 1 hour
   - Persisted to disk

## Benefits

- ✅ Proper session lifecycle management
- ✅ Graceful client disconnection
- ✅ Prevents "session already exists" errors
- ✅ Allows session ID reuse after cleanup
- ✅ Clean state management

## Testing

### Test End Session
```javascript
// Admin
socket.emit('end-session', { sessionId: 'CHURCH-2025-001' });

// Expected: All clients receive session-ended
// Expected: Admin receives confirmation
// Expected: Session status = 'ended'
```

### Test Authorization
```javascript
// Non-admin client tries to end session
socket.emit('end-session', { sessionId: 'CHURCH-2025-001' });

// Expected: Error 403 "Only session admin can end the session"
```

### Test Non-existent Session
```javascript
socket.emit('end-session', { sessionId: 'CHURCH-9999-999' });

// Expected: Error 404 "Session not found"
```

## Updated Primitive Count

- **12 eventos recebidos** (client → server) - was 11
- **18 eventos enviados** (server → client) - was 17
- **Total: 30 primitivas WebSocket** - was 28

## Files Modified

1. `src/websocket-server/src/message-router.ts`
2. `src/websocket-server/src/server.ts`
3. `src/websocket-server/MESSAGE_PROTOCOLS.md`
4. `src/capture/src/websocket-manager.ts`
