# Index.html Refactoring Proposal

## Current State
The `src/capture/index.html` file is **1,550+ lines** with embedded JavaScript (~1,200 lines of script). This makes it difficult to maintain, test, and understand.

## Proposed Module Structure

### 1. **auth-manager.js** - Authentication Management
**Purpose**: Handle all admin authentication, token management, and session persistence
- Admin login/logout functions
- Token storage and retrieval
- Token expiry warnings and auto-refresh
- Stored credentials check on startup
- **Lines**: ~200 lines
- **Key Functions**:
  - `adminLogin()`
  - `adminLogout()`
  - `refreshAdminToken()`
  - `checkStoredAdminTokens()`
  - `setupTokenManagement()`
  - Token management (uses SecureTokenStorage with cognito-tokens.enc)

### 2. **session-manager.js** - Session Management
**Purpose**: Handle session creation, listing, switching, and lifecycle
- Session creation and ending
- Session list display (my sessions vs all sessions)
- Session view switching
- Session reconnection
- **Lines**: ~150 lines
- **Key Functions**:
  - `createSession()`
  - `endCurrentSession()` / `endSessionFromList()`
  - `refreshSessions()`
  - `switchSessionView()`
  - `reconnectToSession()`
  - `updateSessionsList()` / `displaySessions()`

### 3. **websocket-manager.js** - WebSocket Management
**Purpose**: Manage WebSocket server lifecycle and health monitoring
- Server start/stop/reconnect
- Health polling and status updates
- Connection management
- Real-time data updates
- **Lines**: ~200 lines
- **Key Functions**:
  - `checkAndStartWebSocketServer()`
  - `connectToWebSocketServer()`
  - `reconnectWebSocket()`
  - `stopWebSocketServer()`
  - `startHealthPolling()` / `stopHealthPolling()`
  - `updateWebSocketStatus()`

### 4. **streaming-controller.js** - Streaming Control
**Purpose**: Control audio streaming start/stop
- Streaming lifecycle management
- Configuration updates before streaming
- UI state management during streaming
- **Lines**: ~80 lines
- **Key Functions**:
  - `startStreaming()`
  - `stopStreaming()`
  - Session config updates

### 5. **config-manager.js** - Configuration Management
**Purpose**: Handle all configuration loading, saving, and UI updates
- Config loading on startup
- Config tab switching
- Audio device management
- Config persistence
- **Lines**: ~150 lines
- **Key Functions**:
  - `loadConfig()`
  - `saveConfig()`
  - `switchConfigTab()`
  - `loadAudioDevices()`
  - `loadTTSConfig()` / `loadHolyricsConfig()`
  - `getTargetLanguages()`

### 6. **cost-tracker.js** - Cost Tracking
**Purpose**: Track and display AWS service costs
- Real-time cost calculations
- Usage tracking (Transcribe, Translate, Polly)
- Hourly rate calculations
- Cost warning thresholds
- **Lines**: ~100 lines
- **Key Functions**:
  - `trackTranscribeUsage()`
  - `trackTranslateUsage()`
  - `trackPollyUsage()`
  - `updateCostDisplay()`
  - `updateTotalCost()`
  - `resetCostTracking()`

### 7. **holyrics-integration.js** - Holyrics Integration
**Purpose**: Manage Holyrics display integration
- Connection testing
- Screen clearing
- Configuration management
- **Lines**: ~40 lines
- **Key Functions**:
  - `testHolyricsConnection()`
  - `clearHolyrics()`
  - `loadHolyricsConfig()`

### 8. **ui-manager.js** - UI Management
**Purpose**: Handle UI updates, tab switching, and status displays
- Tab switching (languages, config)
- Status message display
- Login status display
- UI element visibility
- Widget updates
- **Lines**: ~120 lines
- **Key Functions**:
  - `switchTab()`
  - `switchConfigTab()`
  - `showStatus()`
  - `showLoginStatus()`
  - `showTokenExpiryWarning()`
  - `updateGainDisplay()`
  - `updateLastActivity()`
  - `updateWidgetsFromHealthData()`

### 9. **event-handlers.js** - IPC Event Handlers
**Purpose**: Set up all Electron IPC event listeners
- Transcription/translation event handlers
- WebSocket event handlers
- Cost tracking event handlers
- Server lifecycle events
- **Lines**: ~100 lines
- **Key Handlers**:
  - `onTranscription()`
  - `onTranslation()`
  - `onStreamingError()`
  - `onPollyUsage()` / `onCostsUpdated()` / `onCostAlert()`
  - `onWebSocketConnected()` / `onWebSocketDisconnected()`
  - `onClientConnected()` / `onClientDisconnected()`
  - `onServerStopping()`

### 10. **app-init.js** - Application Initialization
**Purpose**: Main initialization and DOMContentLoaded setup
- Page load initialization
- Initial token check
- Login form setup
- Module coordination
- **Lines**: ~100 lines

### 11. **utils.js** - Utility Functions
**Purpose**: Helper functions used across modules
- Session ID generation
- Date/time formatting
- Validation helpers
- **Lines**: ~40 lines
- **Key Functions**:
  - `generateSessionId()`
  - Other utility helpers as needed

## Proposed File Structure
```
src/capture/
├── index.html (HTML only, minimal inline script for module loading)
├── src/
│   ├── ui/
│   │   ├── auth-manager.js
│   │   ├── session-manager.js
│   │   ├── websocket-manager.js
│   │   ├── streaming-controller.js
│   │   ├── config-manager.js
│   │   ├── cost-tracker.js
│   │   ├── holyrics-integration.js
│   │   ├── ui-manager.js
│   │   ├── event-handlers.js
│   │   ├── app-init.js
│   │   └── utils.js
```

## Module Dependencies & Loading Order
1. **utils.js** - No dependencies (loaded first)
2. **ui-manager.js** - Depends on: utils
3. **cost-tracker.js** - Depends on: ui-manager
4. **auth-manager.js** - Depends on: ui-manager, utils
5. **websocket-manager.js** - Depends on: ui-manager, auth-manager
6. **session-manager.js** - Depends on: ui-manager, websocket-manager
7. **streaming-controller.js** - Depends on: ui-manager, session-manager
8. **config-manager.js** - Depends on: ui-manager
9. **holyrics-integration.js** - Depends on: ui-manager, config-manager
10. **event-handlers.js** - Depends on: ui-manager, cost-tracker
11. **app-init.js** - Depends on: all above (loaded last)

## Implementation Strategy

### Phase 1: Extract Core Utilities
1. Create `utils.js` with helper functions
2. Create `ui-manager.js` with display functions
3. Test that UI updates still work

### Phase 2: Extract Feature Modules (Low Risk)
4. Create `cost-tracker.js` - self-contained
5. Create `holyrics-integration.js` - self-contained
6. Create `config-manager.js` - mostly self-contained
7. Test configuration and cost tracking

### Phase 3: Extract Critical Modules (Medium Risk)
8. Create `auth-manager.js` - critical for login
9. Create `websocket-manager.js` - depends on auth
10. Test authentication flow

### Phase 4: Extract Coordination Modules (Higher Risk)
11. Create `session-manager.js` - coordinates multiple modules
12. Create `streaming-controller.js` - coordinates streaming
13. Create `event-handlers.js` - sets up IPC listeners
14. Test full streaming workflow

### Phase 5: Finalize
15. Create `app-init.js` with DOMContentLoaded
16. Update `index.html` to load all modules
17. Remove all inline script from index.html
18. Final integration testing

## Benefits
1. **Maintainability**: Each module has clear responsibility
2. **Testability**: Modules can be tested independently
3. **Readability**: ~100-200 lines per file vs 1,550 lines
4. **Collaboration**: Multiple developers can work on different modules
5. **Debugging**: Easier to locate and fix issues
6. **Reusability**: Modules can be reused or replaced

## Risks & Mitigation
1. **Risk**: Module loading order issues
   - **Mitigation**: Explicit dependency chain, load in correct order
   
2. **Risk**: Global variable conflicts
   - **Mitigation**: Use module pattern, minimize globals
   
3. **Risk**: Breaking existing functionality
   - **Mitigation**: Incremental refactoring, test after each phase

## Module Pattern Example
```javascript
// auth-manager.js
const AuthManager = (function() {
    // Private state
    let adminAuthState = {
        isAuthenticated: false,
        username: null,
        token: null
    };
    
    // Public API
    return {
        async login(username, password) {
            // Implementation
        },
        
        async logout() {
            // Implementation
        },
        
        getAuthState() {
            return { ...adminAuthState };
        }
    };
})();

// Make available globally
window.AuthManager = AuthManager;
```

## Estimated Effort
- **Phase 1-2**: 2-3 hours (low risk utilities and features)
- **Phase 3**: 2-3 hours (authentication - needs careful testing)
- **Phase 4**: 3-4 hours (coordination modules - most complex)
- **Phase 5**: 1-2 hours (finalization and testing)
- **Total**: 8-12 hours for complete refactoring

## Implementation Status

✅ **COMPLETED** - October 20, 2025

All 5 phases have been successfully implemented:

### Phase 1: Core Utilities ✅
- ✅ `utils.js` - Helper functions (50 lines)
- ✅ `ui-manager.js` - UI state management (120 lines)

### Phase 2: Self-contained Features ✅
- ✅ `cost-tracker.js` - AWS cost tracking (160 lines)
- ✅ `holyrics-integration.js` - Holyrics integration (70 lines)
- ✅ `config-manager.js` - Configuration management (210 lines)

### Phase 3: Critical Modules ✅
- ✅ `auth-manager.js` - Authentication and token management (380 lines)
- ✅ `websocket-manager.js` - WebSocket lifecycle management (360 lines)

### Phase 4: Coordination Modules ✅
- ✅ `session-manager.js` - Session lifecycle management (120 lines)
- ✅ `streaming-controller.js` - Audio streaming control (140 lines)
- ✅ `event-handlers.js` - Electron IPC event listeners (200 lines)

### Phase 5: Finalization ✅
- ✅ `app-init.js` - Application initialization (150 lines)
- ✅ `index.html` - Updated with module loading script tags
- ✅ All inline scripts removed from HTML (clean separation)

### Results
- **Original**: 1,550+ lines in single HTML file (1,200 lines of JavaScript)
- **Refactored**: 11 modular JavaScript files totaling ~1,960 lines
- **index.html**: Now ~780 lines (HTML/CSS only, no inline JS except module loading)
- **Maintainability**: ✅ Significant improvement - clear separation of concerns
- **Testability**: ✅ Each module can be tested independently
- **Loading Order**: ✅ Proper dependency chain implemented

### Module Loading Order (in index.html)
```html
<!-- Phase 1: Core utilities -->
<script src="src/ui/utils.js"></script>
<script src="src/ui/ui-manager.js"></script>

<!-- Phase 2: Self-contained features -->
<script src="src/ui/cost-tracker.js"></script>
<script src="src/ui/holyrics-integration.js"></script>
<script src="src/ui/config-manager.js"></script>

<!-- Phase 3: Critical modules -->
<script src="src/ui/auth-manager.js"></script>
<script src="src/ui/websocket-manager.js"></script>

<!-- Phase 4: Coordination modules -->
<script src="src/ui/session-manager.js"></script>
<script src="src/ui/streaming-controller.js"></script>
<script src="src/ui/event-handlers.js"></script>

<!-- Phase 5: Application initialization (must load last) -->
<script src="src/ui/app-init.js"></script>
```

## Next Steps
1. ✅ ~~Review and approve this proposal~~
2. ✅ ~~Begin Phase 1 implementation~~
3. ✅ ~~Test incrementally after each phase~~
4. ⏭️ Test the refactored application end-to-end
5. ⏭️ Monitor for any runtime issues in production
