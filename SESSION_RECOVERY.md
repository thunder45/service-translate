# Session Recovery Implementation

## Problem
When the capture app crashes or is restarted, it loses connection to the active session it created, requiring manual session recreation.

## Solution
Persist active session ID to config and auto-reconnect on startup.

## Implementation

### 1. Config Schema Update (`config.ts`)
```typescript
tts: {
  mode: 'neural' | 'standard' | 'local' | 'disabled';
  host: string;
  port: number;
  activeSessionId?: string; // NEW: Tracks current active session
}
```

### 2. WebSocketManager Methods (`websocket-manager.ts`)

#### `createSession()` - Enhanced
- Persists `sessionId` to `config.tts.activeSessionId` after creation
- Allows recovery after restart

#### `reconnectToSession()` - NEW
```typescript
async reconnectToSession(sessionId: string): Promise<boolean>
```
- Attempts to rejoin existing session as admin
- Returns `true` if successful, `false` if session no longer exists
- Clears `activeSessionId` from config if session not found

#### `endSession()` - Enhanced
- Clears `activeSessionId` from config when session ends
- Prevents reconnection attempts to ended sessions

#### Helper Methods - NEW
```typescript
private persistActiveSession(sessionId: string): void
private clearActiveSession(): void
```

### 3. Auto-Reconnect Logic (`main.ts`)

On WebSocket connection:
```typescript
if (config?.tts?.activeSessionId) {
  const reconnected = await webSocketManager.reconnectToSession(
    config.tts.activeSessionId
  );
  if (reconnected) {
    // Notify UI: session-reconnected event
  }
}
```

## Flow Diagrams

### Normal Session Creation
```
1. Admin creates session → sessionId saved to config
2. App crashes
3. App restarts → connects to WebSocket
4. Auto-reconnect to sessionId
5. ✅ Session restored
```

### Session No Longer Exists
```
1. Admin creates session → sessionId saved to config
2. Server restarts (session lost)
3. App restarts → connects to WebSocket
4. Auto-reconnect fails (404)
5. activeSessionId cleared from config
6. ❌ User must create new session
```

### Manual Session End
```
1. Admin ends session
2. activeSessionId cleared from config
3. App restart → no reconnection attempt
```

## Benefits

✅ **Seamless Recovery**: App reconnects automatically after crash
✅ **No Data Loss**: Session state preserved on server
✅ **User Experience**: No manual intervention needed
✅ **Clean State**: Cleared when session ends normally
✅ **Fail-Safe**: Handles non-existent sessions gracefully

## Edge Cases Handled

1. **Session ended while app offline**: 
   - Reconnect fails → `activeSessionId` cleared

2. **Server restart (sessions lost)**:
   - Reconnect fails → `activeSessionId` cleared

3. **Multiple app instances**:
   - Only session creator (admin) can reconnect
   - Other instances get 403 error

4. **Config corruption**:
   - Try-catch prevents crashes
   - Logs error and continues

## Testing

### Test Crash Recovery
```bash
1. Start app, create session CHURCH-2025-001
2. Kill app process
3. Restart app
4. Expected: Auto-reconnects to CHURCH-2025-001
```

### Test Session Ended
```bash
1. Start app, create session CHURCH-2025-001
2. End session
3. Restart app
4. Expected: No reconnection attempt
```

### Test Server Restart
```bash
1. Start app, create session CHURCH-2025-001
2. Restart TTS server (sessions lost)
3. Restart app
4. Expected: Reconnect fails, activeSessionId cleared
```

## UI Integration

### New Event: `session-reconnected`
```javascript
// Renderer process
window.electronAPI.on('session-reconnected', (sessionId) => {
  showStatus(`Reconnected to session: ${sessionId}`, 'success');
  updateSessionId(sessionId);
});
```

## Files Modified

1. `src/capture/src/config.ts` - Added `activeSessionId` field
2. `src/capture/src/websocket-manager.ts` - Added reconnect logic
3. `src/capture/src/main.ts` - Added auto-reconnect on connect

## Limitations

- Only works if server still has the session (not restarted)
- Session must not have been ended by another admin
- Requires WebSocket connection to succeed first

## Future Enhancements

- Persist full session config for recreation if needed
- Add UI indicator for "reconnected" vs "new" session
- Support reconnection with retry logic
