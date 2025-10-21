# WebSocket Manager Dead Code Analysis

## Analysis Complete

Analyzed all functions in `src/capture/src/ui/websocket-manager.js` to identify unused code.

## Functions in websocket-manager.js

### ✅ Active Functions (All Used)

| Function | Called By | Status |
|----------|-----------|--------|
| `checkAndStartWebSocketServer()` | `connectAndAuthenticate()` (auth-manager.js) | ✅ Active |
| `checkWebSocketServerStatus()` | `connectAndAuthenticate()` (auth-manager.js) | ✅ Active |
| `connectToWebSocketServer()` | `connectAndAuthenticate()` (auth-manager.js) | ✅ Active |
| `startHealthPolling()` | `connectToWebSocketServer()` | ✅ Active |
| `stopHealthPolling()` | `stopWebSocketServer()`, `adminLogout()` | ✅ Active |
| `fetchHealthData()` | `startHealthPolling()` (interval) | ✅ Active |
| `updateWidgetsFromHealthData()` | `fetchHealthData()` | ✅ Active |
| `stopWebSocketServer()` | HTML onclick handler | ✅ Active |
| `updateStatus()` | Multiple internal calls, `connectAndAuthenticate()` | ✅ Active |
| `refreshSessions()` | HTML onclick, `connectAndAuthenticate()`, session-manager.js | ✅ Active |
| `switchSessionView()` | HTML onclick, `updateSessionsList()` | ✅ Active |
| `updateSessionsList()` | `refreshSessions()` | ✅ Active |
| `displaySessions()` | `switchSessionView()` | ✅ Active |
| `viewSession()` | HTML onclick (dynamically generated in displaySessions) | ✅ Active |
| `endSessionFromList()` | HTML onclick (dynamically generated in displaySessions) | ✅ Active |
| `reconnectToSession()` | HTML onclick (dynamically generated in displaySessions) | ✅ Active |

### ❌ Dead Code Found and Removed

**File**: `src/capture/src/ui/event-handlers.js`

**Dead Function Calls** (functions that didn't exist in websocket-manager.js):

1. **`handleWebSocketConnected()`** - ❌ Never existed
   - Called from: `onWebSocketConnected` event handler
   - Fix: Removed call, kept simple logging

2. **`handleWebSocketDisconnected()`** - ❌ Never existed
   - Called from: `onWebSocketDisconnected` event handler
   - Fix: Removed call, kept simple logging

3. **`handleServerStopping()`** - ❌ Never existed
   - Called from: `onServerStopping` event handler
   - Fix: Removed call, kept status message

## Changes Made

### Before (Dead Code)
```javascript
function setupWebSocketHandlers() {
    window.electronAPI.onWebSocketConnected(async () => {
        if (window.websocketManager) {
            window.websocketManager.handleWebSocketConnected(); // ❌ Doesn't exist
        }
    });

    window.electronAPI.onWebSocketDisconnected(() => {
        if (window.websocketManager) {
            window.websocketManager.handleWebSocketDisconnected(); // ❌ Doesn't exist
        }
    });
    // ...
}

function setupServerHandlers() {
    window.electronAPI.onServerStopping((data) => {
        if (window.websocketManager) {
            window.websocketManager.handleServerStopping(); // ❌ Doesn't exist
        }
        window.uiManager.showStatus('WebSocket server stopped. Session preserved.', 'info');
    });
}
```

### After (Clean)
```javascript
function setupWebSocketHandlers() {
    // WebSocket connected - just log it, UI is updated by connectAndAuthenticate()
    window.electronAPI.onWebSocketConnected(async () => {
        console.log('✓ WebSocket connected event received');
    });

    // WebSocket disconnected - just log it, reconnection is handled manually
    window.electronAPI.onWebSocketDisconnected(() => {
        console.log('⚠️ WebSocket disconnected event received');
    });

    // Client events still update activity via uiManager
    window.electronAPI.onClientConnected((clientInfo) => {
        console.log('Client connected:', clientInfo);
        window.uiManager.updateLastActivity('Client connected');
    });

    window.electronAPI.onClientDisconnected((clientInfo) => {
        console.log('Client disconnected:', clientInfo);
        window.uiManager.updateLastActivity('Client disconnected');
    });
}

function setupServerHandlers() {
    window.electronAPI.onServerStopping((data) => {
        console.log('Server stopping event received:', data);
        window.uiManager.showStatus('WebSocket server stopped. Session preserved.', 'info');
    });
}
```

## Result

✅ **All functions in websocket-manager.js are actively used** - no dead code in the module itself

❌ **Dead code was in event-handlers.js** - calling non-existent functions

✅ **Fixed by removing calls to non-existent functions** while preserving event logging

## Notes

- The WebSocket events are still being listened to for logging purposes
- UI updates are properly handled by `connectAndAuthenticate()` function
- Activity tracking correctly uses `window.uiManager.updateLastActivity()` not `window.websocketManager`
- No breaking changes to functionality
