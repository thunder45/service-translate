# WebSocket Connection & Authentication Consolidation

## Summary

Successfully consolidated duplicate connection and authentication logic into a single, reusable function that handles both startup and manual reconnection scenarios.

## Problem Identified

Two functions were performing identical operations:
- `connectAndAuthenticate()` in `auth-manager.js` - used for startup
- `reconnectWebSocket()` in `websocket-manager.js` - used for manual reconnection

Both functions followed the same steps:
1. Check server health using `checkWebSocketServerStatus()`
2. Start server if not running using `checkAndStartWebSocketServer()`
3. Connect to server using `connectToWebSocketServer()`
4. Authenticate with token using `adminAuthenticateWithToken()`
5. Update status to 'connected'
6. Refresh sessions list

## Solution Implemented

### Single Connection Function
Created one unified function in `auth-manager.js` that handles both use cases:

```javascript
/**
 * Single method to handle connection and authentication
 * Used for both startup (with stored tokens) and manual reconnection
 * Uses existing checkWebSocketServerStatus() - does not reimplement health check
 * 
 * @param {string} token - Optional token, if not provided will use current auth state
 */
async function connectAndAuthenticate(token) {
    // If no token provided, get from current auth state
    if (!token) {
        if (!adminAuthState.token) {
            console.error('No token available for authentication');
            window.uiManager.showStatus('⚠️ Please login first', 'warning');
            return;
        }
        token = adminAuthState.token;
    }

    window.uiManager.showStatus('Connecting to WebSocket server...', 'info');
    window.uiManager.updateLastActivity('Connection requested');

    // Check if server is running
    console.log('Checking WebSocket server health...');
    const isServerRunning = await window.websocketManager.checkWebSocketServerStatus();

    if (!isServerRunning) {
        console.log('Server not running, starting it...');
        await window.websocketManager.checkAndStartWebSocketServer();
        await new Promise(resolve => setTimeout(resolve, 3000));
    } else {
        console.log('✓ Server already running');
    }

    // Connect to server
    console.log('Connecting to WebSocket server...');
    await window.websocketManager.connectToWebSocketServer();
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Authenticate
    console.log('Authenticating with token...');
    const wsAuthResult = await window.electronAPI.adminAuthenticateWithToken({ token });

    if (wsAuthResult.success) {
        window.websocketManager.updateStatus('connected');
        await window.websocketManager.refreshSessions();
        window.uiManager.showStatus('✅ Connected and authenticated', 'success');
        console.log('✓ Connection and authentication successful');
    } else {
        console.error('Authentication failed:', wsAuthResult);
        window.websocketManager.updateStatus('disconnected');
        window.uiManager.showStatus('⚠️ Authentication failed. Please reconnect.', 'warning');
    }
}
```

### Usage

**Startup with stored tokens:**
```javascript
await connectAndAuthenticate(stored.token);
```

**Manual reconnection (no token parameter):**
```javascript
await connectAndAuthenticate(); // Uses current adminAuthState.token
```

**Reconnect button:**
```html
<button onclick="reconnectWebSocket()">🔄 Reconnect</button>
```
Where `window.reconnectWebSocket = window.connectAndAuthenticate;`

## Files Modified

### 1. src/capture/src/main.ts
**Change**: Removed duplicate authentication from `connect-websocket` handler
- Main process now only connects to server
- Authentication is solely handled by UI layer
- Eliminates duplicate authentication issue

### 2. src/capture/src/ui/websocket-manager.js
**Changes**:
- Removed entire `reconnectWebSocket()` function (duplicate logic)
- Added alias: `window.reconnectWebSocket = window.connectAndAuthenticate;`
- HTML Reconnect button continues to work without changes

### 3. src/capture/src/ui/auth-manager.js
**Changes**:
- Enhanced `connectAndAuthenticate()` to accept optional token parameter
- If no token provided, uses current `adminAuthState.token`
- Exported `connectAndAuthenticate` in both module API and global scope
- Function now handles both startup and manual reconnection

## Benefits

✅ **Single Source of Truth** - One function handles all connection/authentication scenarios
✅ **No Code Duplication** - Eliminated 50+ lines of duplicate code
✅ **Consistent Behavior** - Startup and reconnection follow identical flow
✅ **Easier Maintenance** - Changes only need to be made in one place
✅ **Single Health Check** - All code paths use `checkWebSocketServerStatus()`
✅ **Clear Separation** - Server start, connection, and authentication are distinct steps

## Connection Flow

```
User Action (Startup or Reconnect)
    ↓
connectAndAuthenticate(token?)
    ↓
checkWebSocketServerStatus() ← Single health check implementation
    ↓
[If server down] checkAndStartWebSocketServer()
    ↓
connectToWebSocketServer()
    ↓
adminAuthenticateWithToken()
    ↓
updateStatus('connected')
    ↓
refreshSessions()
```

## Testing Scenarios

### Scenario 1: Fresh Startup (WS not running)
- ✓ App loads stored tokens
- ✓ Calls `connectAndAuthenticate(stored.token)`
- ✓ Health check fails → starts server
- ✓ Connects → authenticates once → lists sessions

### Scenario 2: Startup with WS Running
- ✓ App loads stored tokens
- ✓ Calls `connectAndAuthenticate(stored.token)`
- ✓ Health check succeeds → skips server start
- ✓ Connects → authenticates once → lists sessions
- ✓ Server should NOT crash or restart

### Scenario 3: Manual Reconnect
- ✓ User clicks "Reconnect" button
- ✓ Calls `connectAndAuthenticate()` with no parameters
- ✓ Uses stored token from `adminAuthState`
- ✓ Same flow as startup
- ✓ UI updates properly to "connected"

## Code Quality Improvements

1. **No Health Check Duplication**: Single `checkWebSocketServerStatus()` function used everywhere
2. **No Process Killing**: Removed aggressive process cleanup that could cause crashes
3. **Clear Function Names**: `checkAndStartWebSocketServer()` does exactly what it says
4. **Separation of Concerns**: Each function has a single, well-defined responsibility
5. **Proper Error Handling**: Consistent error messages and status updates

## Migration Notes

- No HTML changes required - Reconnect button continues to work via global alias
- No breaking changes to existing APIs
- Backward compatible with existing onclick handlers
- TypeScript compilation successful with no errors
