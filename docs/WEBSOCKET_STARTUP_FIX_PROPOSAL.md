# WebSocket Startup & Connection Reliability Fix Proposal

## Problem Analysis

Based on the detailed logs provided, there are several critical issues with the current startup and connection process:

### Issue 1: WebSocket Server Crashes on Reconnection
**Symptom**: When the capture app starts with WS server already running, the server crashes immediately after connection.

**Evidence**:
```
Connected to WebSocket server
=== WebSocket Disconnected ===
Reason: transport close
```

**Root Cause**: The existing WS server process terminates when the capture app connects, likely due to:
- Process management conflict (attempting to start a new server kills the old one)
- Uncaught exception in the server when handling reconnection
- Race condition in server initialization

### Issue 2: Duplicate Authentication
**Symptom**: Authentication happens twice on startup.

**Evidence from logs**:
```
Automatic authentication successful
...
[Later] admin-auth request again
Admin authentication successful
```

**Root Cause**: Two code paths both authenticate:
1. Main process (`main.ts` line ~271) - authenticates immediately after connection
2. UI layer (`auth-manager.js` line ~380) - authenticates 4.5 seconds after startup

### Issue 3: UI Stuck in "Connecting..." State
**Symptom**: After first manual reconnect, UI shows "Connecting..." indefinitely despite successful connection.

**Root Cause**: WebSocket status update not propagating correctly to UI layer after manual reconnection.

### Issue 4: No Reliable Server Health Check
**Symptom**: App attempts to connect before verifying server is ready and healthy.

**Root Cause**: No health check mechanism before connection attempts.

---

## Proposed Solution

### Phase 1: Single Health Check & Smart Connection Strategy

#### 1.1 Update Main Process Connection Handler
**File**: `src/capture/src/main.ts`

Modify the `connect-websocket` handler to not authenticate (remove duplicate auth):

```typescript
ipcMain.handle('connect-websocket', async (_event, options) => {
    console.log('=== WebSocket Connection Request ===');
    console.log('Options:', options);

    try {
        // STEP 1: Check if already connected
        if (webSocketManager.isConnectedToServer()) {
            console.log('Already connected to WebSocket server');
            return { success: true, reason: 'already-connected' };
        }

        // STEP 2: Connect to server (UI layer has already verified server is running)
        console.log('Connecting to WebSocket server...');
        await webSocketManager.connect();
        console.log('Connected successfully');

        // STEP 3: Wait for UI layer to authenticate
        // Don't authenticate here to avoid duplicate authentication
        console.log('Connection established, UI layer will handle authentication');
        
        return { 
            success: true,
            shouldAuthenticate: false // UI layer will handle authentication
        };

    } catch (error: any) {
        console.error('WebSocket connection error:', error);
        return { success: false, error: error.message };
    }
});
```

### Phase 2: Single Authentication Path

#### 2.1 Remove Duplicate Authentication from Main Process
**File**: `src/capture/src/main.ts`

Remove the automatic authentication block (lines ~271-290) from the `connect-websocket` handler. Let only the UI layer handle authentication.

#### 2.2 Update UI Layer Authentication Flow
**File**: `src/capture/src/ui/auth-manager.js`

Modify `checkStoredAdminTokens()` and add `connectAndAuthenticate()`:

```javascript
async function checkStoredAdminTokens() {
    try {
        const stored = await window.electronAPI.loadStoredAdminTokens();
        
        if (stored && stored.token && stored.refreshToken) {
            console.log('✓ Found stored tokens for:', stored.username);

            const expiry = stored.tokenExpiry ? new Date(stored.tokenExpiry) : null;

            // Update state
            adminAuthState = {
                isAuthenticated: true,
                adminId: stored.adminId,
                username: stored.username,
                token: stored.token,
                refreshToken: stored.refreshToken,
                tokenExpiry: expiry,
                tokenRefreshTimer: null,
                expiryWarningTimer: null
            };

            // Set global flags
            window.isLoggedIn = true;
            window.adminAuthResult = {
                success: true,
                username: stored.username,
                token: stored.token,
                refreshToken: stored.refreshToken,
                tokenExpiry: expiry ? expiry.getTime() : null,
                adminId: stored.adminId
            };

            // Update UI
            window.utils.getElement('login-panel')?.classList.add('hidden');
            window.utils.getElement('main-app')?.classList.remove('hidden');
            window.utils.getElement('admin-logout-btn')?.classList.remove('hidden');

            setupTokenManagement();
            window.uiManager.showStatus(`✅ Reconnected as ${stored.username}`, 'success');

            // Start WebSocket connection flow
            if (window.websocketManager) {
                await connectAndAuthenticate(stored.token);
            }

            return true;
        }
    } catch (error) {
        console.error('Failed to check stored tokens:', error);
    }
    
    return false;
}

/**
 * Single method to handle connection and authentication
 * Uses existing checkWebSocketServerStatus() - does not reimplement health check
 */
async function connectAndAuthenticate(token) {
    try {
        // Check if server is running using existing health check
        console.log('Checking WebSocket server health...');
        const isServerRunning = await window.websocketManager.checkWebSocketServerStatus();

        if (!isServerRunning) {
            console.log('Server not running, starting it...');
            // This will check health and start server, but NOT connect
            await window.websocketManager.checkAndStartWebSocketServer();
            
            // Wait for server to be fully ready
            await new Promise(resolve => setTimeout(resolve, 3000));
        } else {
            console.log('Server already running');
        }

        // Now connect to the server
        console.log('Connecting to WebSocket server...');
        await window.websocketManager.connectToWebSocketServer();
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Authenticate once
        console.log('Authenticating with stored token...');
        const wsAuthResult = await window.electronAPI.adminAuthenticateWithToken({ 
            token: token 
        });

        if (wsAuthResult.success) {
            window.websocketManager.updateStatus('connected');
            await window.websocketManager.refreshSessions();
            window.uiManager.showStatus('✅ Connected and authenticated', 'success');
            console.log('✓ Authentication successful');
        } else {
            console.error('Authentication failed:', wsAuthResult);
            window.websocketManager.updateStatus('disconnected');
            window.uiManager.showStatus('⚠️ Authentication failed. Please reconnect.', 'warning');
        }
    } catch (error) {
        console.error('Connection/authentication error:', error);
        window.websocketManager.updateStatus('disconnected');
        window.uiManager.showStatus('⚠️ Connection failed. Click Reconnect.', 'warning');
    }
}
```

### Phase 3: Separate Server Start from Connection

#### 3.1 Modify checkAndStartWebSocketServer
**File**: `src/capture/src/ui/websocket-manager.js`

Remove `connectToWebSocketServer()` calls from within `checkAndStartWebSocketServer()`:

```javascript
async checkAndStartWebSocketServer() {
    console.info('Checking WebSocket server status, and start it if needed...');
    try {
        // Check if server is already running using existing health check
        const isRunning = await this.checkWebSocketServerStatus();
        
        if (isRunning) {
            updateStatus('running');
            window.uiManager.updateLastActivity('Server already running');
            window.uiManager.showStatus('WebSocket server is already running', 'success');
            console.info('WebSocket server is already running');
            // REMOVED: connectToWebSocketServer() call - caller will handle connection
        } else {
            // Start the server
            updateStatus('starting');
            window.uiManager.showStatus('Starting WebSocket server...', 'info');
            console.info('Starting WebSocket server...');
            window.uiManager.updateLastActivity('Starting server...');
            
            const result = await window.electronAPI.startWebSocketServer();
            
            if (result.success) {
                updateStatus('running');
                window.uiManager.updateLastActivity('Server started successfully');
                window.uiManager.showStatus('WebSocket server started successfully', 'success');
                console.info('WebSocket server started successfully');
                // REMOVED: connectToWebSocketServer() call - caller will handle connection
            } else {
                updateStatus('failed');
                window.uiManager.updateLastActivity('Server start failed');
                window.uiManager.showStatus(`Failed to start server: ${result.message}`, 'error');
                console.error('Failed to start WebSocket server:', result.message);
            }
        }
    } catch (error) {
        console.error('Error checking/starting WebSocket server:', error);
        updateStatus('failed');
        window.uiManager.updateLastActivity('Server check failed');
        window.uiManager.showStatus(`Server check failed: ${error.message}`, 'error');
    }
}
```

#### 3.2 Add Server-Side Graceful Reconnection
**File**: `src/websocket-server/src/server.ts`

Add connection deduplication:

```typescript
const activeConnections = new Map<string, { adminId: string, lastSeen: number }>();

io.on('connection', (socket) => {
    console.log(`=== CLIENT CONNECTED: ${socket.id} ===`);

    // Check for duplicate connections from same admin
    socket.on('admin-auth', async (data) => {
        if (data.method === 'token') {
            // Validate token and get adminId...
            const adminId = extractAdminIdFromToken(data.token);
            
            // Check for existing connection
            const existing = Array.from(activeConnections.entries())
                .find(([, info]) => info.adminId === adminId);
            
            if (existing) {
                const [existingSocketId] = existing;
                console.log(`Duplicate connection detected for admin ${adminId}`);
                console.log(`Closing old connection: ${existingSocketId}`);
                
                // Gracefully close old connection
                const oldSocket = io.sockets.sockets.get(existingSocketId);
                if (oldSocket) {
                    oldSocket.emit('duplicate-connection', { 
                        reason: 'New connection established' 
                    });
                    oldSocket.disconnect(true);
                }
                
                activeConnections.delete(existingSocketId);
            }
            
            // Register new connection
            activeConnections.set(socket.id, {
                adminId,
                lastSeen: Date.now()
            });
        }
    });

    socket.on('disconnect', () => {
        activeConnections.delete(socket.id);
    });
});
```

### Phase 4: Improved Status Synchronization

#### 4.1 Add Status Verification
**File**: `src/capture/src/ui/websocket-manager.js`

Add method to verify actual connection state (uses existing checkWebSocketServerStatus):

```javascript
async verifyConnectionState() {
    try {
        // Check if socket is actually connected (this would need to be tracked in websocket-manager.js)
        const socketConnected = this.socket && this.socket.connected;
        
        // Check if server is responding using existing health check
        const serverResponsive = await this.checkWebSocketServerStatus();

        const actualState = socketConnected && serverResponsive ? 'connected' : 'disconnected';
        
        // Update UI if state mismatch
        if (this.connectionStatus !== actualState) {
            console.log(`State mismatch detected: UI shows "${this.connectionStatus}" but actual is "${actualState}"`);
            this.updateStatus(actualState);
        }

        return actualState;
    } catch (error) {
        console.error('Error verifying connection state:', error);
        return 'disconnected';
    }
}
```

Call this method periodically and after reconnection attempts.

---

## Implementation Plan

### Step 1: Use Existing Health Check & Remove Connection from Server Start
1. Modify `main.ts` to remove duplicate authentication
2. Remove `connectToWebSocketServer()` calls from `checkAndStartWebSocketServer()`
3. Ensure all health checks use existing `checkWebSocketServerStatus()`

### Step 2: Remove Duplicate Authentication
1. Modify `connect-websocket` handler to not authenticate
2. Update UI layer to be sole authentication path
3. Test single authentication flow

### Step 3: Graceful Server Reconnection
1. Add duplicate connection handling to server
2. Add process management to prevent crashes
3. Test reconnection scenarios

### Step 4: Status Synchronization
1. Add status verification mechanism
2. Periodic health checks
3. Immediate verification after reconnection

### Step 5: Testing
1. Test fresh startup (WS not running)
2. Test startup with WS already running
3. Test reconnection after disconnect
4. Test multiple rapid reconnections
5. Test zombie process cleanup

---

## Success Criteria

✅ **Scenario 1: Fresh Startup**
- WS not running → App starts WS → Connects → Authenticates once → Lists sessions
- No errors, no duplicate authentication

✅ **Scenario 2: Startup with Running WS**
- WS running → App detects it → Connects to existing → Authenticates once → Lists sessions
- WS does not crash or restart

✅ **Scenario 3: Reconnection**
- After disconnect → Click Reconnect → Connects immediately → Authenticates → Lists sessions
- UI shows correct status throughout

✅ **Scenario 4: Multiple Reconnects**
- Rapid reconnections don't cause crashes
- Old connections cleaned up gracefully
- No zombie processes remain

---

## Risk Mitigation

**Risk**: Changes break existing working scenarios
**Mitigation**: Implement incrementally with rollback plan for each phase

**Risk**: Health check false negatives
**Mitigation**: Add retry logic with exponential backoff

**Risk**: Process cleanup too aggressive
**Mitigation**: Add confirmation before killing processes

**Risk**: Status synchronization overhead
**Mitigation**: Limit verification frequency (max once per 5 seconds)

---

## Timeline Estimate

- Phase 1: 2-3 hours
- Phase 2: 1-2 hours
- Phase 3: 2-3 hours
- Phase 4: 1-2 hours
- Testing: 2-3 hours

**Total**: 8-13 hours of implementation time
