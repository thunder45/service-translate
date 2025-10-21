# WebSocket Manager 2-Level Dead Code Analysis

## Methodology

Traced each function through 2 levels of calling functions to identify orphaned call chains:
- **Level 0**: Function itself
- **Level 1**: Direct callers  
- **Level 2**: Callers of Level 1 functions
- **Dead Code**: If Level 2 has no callers, entire chain is dead

## Complete Call Graph

### Function: checkAndStartWebSocketServer()
```
Level 0: checkAndStartWebSocketServer()
    ↓
Level 1: connectAndAuthenticate() [auth-manager.js]
    ↓
Level 2: 
    - checkStoredAdminTokens() [auth-manager.js] → app-init.js startup
    - window.reconnectWebSocket alias → HTML onclick (Reconnect button)
```
**Status**: ✅ ACTIVE - Used by startup and manual reconnect

### Function: checkWebSocketServerStatus()
```
Level 0: checkWebSocketServerStatus()
    ↓
Level 1: connectAndAuthenticate() [auth-manager.js]
    ↓
Level 2: [Same as above]
```
**Status**: ✅ ACTIVE

### Function: connectToWebSocketServer()
```
Level 0: connectToWebSocketServer()
    ↓
Level 1: connectAndAuthenticate() [auth-manager.js]
    ↓
Level 2: [Same as above]
```
**Status**: ✅ ACTIVE

### Function: startHealthPolling()
```
Level 0: startHealthPolling(host, port)
    ↓
Level 1: connectToWebSocketServer()
    ↓
Level 2: connectAndAuthenticate() [auth-manager.js]
    ↓
Level 3: checkStoredAdminTokens() + Reconnect button
```
**Status**: ✅ ACTIVE

### Function: stopHealthPolling()
```
Level 0: stopHealthPolling()
    ↓
Level 1: 
    - stopWebSocketServer() → HTML onclick (Stop button)
    - adminLogout() [auth-manager.js] → HTML onclick (Logout button)
```
**Status**: ✅ ACTIVE

### Function: fetchHealthData()
```
Level 0: fetchHealthData(host, port)
    ↓
Level 1: startHealthPolling() [setInterval callback]
    ↓
Level 2: [See startHealthPolling above]
```
**Status**: ✅ ACTIVE

### Function: updateWidgetsFromHealthData()
```
Level 0: updateWidgetsFromHealthData(healthData)
    ↓
Level 1: fetchHealthData()
    ↓
Level 2: [See fetchHealthData above]
```
**Status**: ✅ ACTIVE

### Function: stopWebSocketServer()
```
Level 0: stopWebSocketServer()
    ↓
Level 1: HTML onclick → Stop button
```
**Status**: ✅ ACTIVE

### Function: updateStatus()
```
Level 0: updateStatus(status)
    ↓
Level 1: Internal calls from:
    - checkAndStartWebSocketServer()
    - connectToWebSocketServer()
    - stopWebSocketServer()
    - connectAndAuthenticate() [auth-manager.js]
    ↓
Level 2: [All trace back to active functions]
```
**Status**: ✅ ACTIVE

### Function: refreshSessions()
```
Level 0: refreshSessions()
    ↓
Level 1:
    - HTML onclick → Refresh button
    - connectAndAuthenticate() [auth-manager.js]
    - createSession() [session-manager.js] → HTML onclick
    - endCurrentSession() [session-manager.js] → HTML onclick
```
**Status**: ✅ ACTIVE

### Function: switchSessionView()
```
Level 0: switchSessionView(view)
    ↓
Level 1:
    - HTML onclick → session view tabs (My Sessions / All Sessions)
    - updateSessionsList() → refreshSessions() → [multiple active callers]
```
**Status**: ✅ ACTIVE

### Function: updateSessionsList()
```
Level 0: updateSessionsList(ownedSessions, allSessions)
    ↓
Level 1: refreshSessions()
    ↓
Level 2: [See refreshSessions above - multiple active callers]
```
**Status**: ✅ ACTIVE

### Function: displaySessions()
```
Level 0: displaySessions(sessions)
    ↓
Level 1: switchSessionView()
    ↓
Level 2: [See switchSessionView above - active callers]
```
**Status**: ✅ ACTIVE

### Function: viewSession()
```
Level 0: viewSession(sessionId)
    ↓
Level 1: Dynamically generated HTML onclick in displaySessions()
    ↓
Level 2: displaySessions() → switchSessionView() → [active callers]
```
**Status**: ⚠️ POTENTIALLY DEAD - Only shows a status message, no real implementation
**Note**: This is a stub function that's never actually useful. It's called from dynamically generated buttons for read-only sessions, but only displays a message with no actual functionality.

### Function: endSessionFromList()
```
Level 0: endSessionFromList(sessionId)
    ↓
Level 1: Dynamically generated HTML onclick in displaySessions()
    ↓
Level 2: displaySessions() → switchSessionView() → [active callers]
```
**Status**: ✅ ACTIVE - Has real functionality (ends a session)

### Function: reconnectToSession()
```
Level 0: reconnectToSession(sessionId)
    ↓
Level 1: Dynamically generated HTML onclick in displaySessions()
    ↓
Level 2: displaySessions() → switchSessionView() → [active callers]
```
**Status**: ✅ ACTIVE - Has real functionality (reconnects to session)

## Summary

### ✅ All Functions Have Active Call Chains
All 16 functions in websocket-manager.js can be traced back through 2+ levels to:
- HTML onclick handlers (user interaction)
- App initialization (startup flow)
- Event handlers (IPC events)

### ⚠️ Stub Function (Not Technically Dead, But Not Useful)

**Function**: `viewSession(sessionId)`
```javascript
async function viewSession(sessionId) {
    window.uiManager.showStatus(`Viewing session ${sessionId} (read-only)`, 'info');
    // In a full implementation, this would show session details in a modal or panel
}
```

**Analysis**:
- Called from dynamically generated onclick for read-only sessions
- Only shows a status message
- No actual implementation
- Comment admits "In a full implementation..."

**Recommendation**: 
- Not technically dead code (it IS called)
- But it's a non-functional stub
- Could be removed if read-only session viewing is not planned
- Or could be kept as a placeholder for future feature

## Conclusion

**No dead code found at 2-level analysis** - All functions are part of active call chains that eventually reach:
1. User interactions (HTML onclick handlers)
2. App startup (initialization)
3. IPC events (connection/disconnection notifications)

The only questionable code is `viewSession()` which is a stub with no real functionality, but it's still technically "alive" because it's in an active call chain.
