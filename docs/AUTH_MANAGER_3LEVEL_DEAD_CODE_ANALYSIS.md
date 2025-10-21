# Auth Manager 3-Level Dead Code Analysis

## Methodology

Traced each function in `src/capture/src/ui/auth-manager.js` through 3 levels to identify orphaned call chains.

## Complete Call Graph Analysis

### Function: adminLogin()
```
Level 0: adminLogin()
    ↓
Level 1: 
    - app-init.js: adminLoginBtn.click event listener
    - app-init.js: window.authManager.adminLogin() direct call
    ↓
Level 2: app-init.js initialization
    ↓
Level 3: App startup (index.html loads app-init.js)
```
**Status**: ✅ ACTIVE - User login action

**Calls internally**:
- setupTokenManagement() → ✅ Active
- storeAdminTokens() → ✅ Active
- showLoginStatus() → ✅ Active

---

### Function: adminLogout()
```
Level 0: adminLogout()
    ↓
Level 1:
    - HTML onclick: Logout button
    - refreshAdminToken() → on error
    - showTokenExpiryWarning() → on expiry timeout
    ↓
Level 2:
    - Direct user action (HTML onclick)
    - setupTokenManagement() → adminLogin(), checkStoredAdminTokens()
    ↓
Level 3: Active (user login, app startup)
```
**Status**: ✅ ACTIVE

**Calls internally**:
- clearAdminTokens() → ✅ Active (only called by adminLogout)

---

### Function: refreshAdminToken()
```
Level 0: refreshAdminToken()
    ↓
Level 1:
    - HTML onclick: Token expiry warning Refresh button
    - setupTokenManagement() → setTimeout callback
    ↓
Level 2: 
    - Direct user action (HTML onclick)
    - adminLogin(), checkStoredAdminTokens()
    ↓
Level 3: Active (user login, app startup)
```
**Status**: ✅ ACTIVE

**Calls internally**:
- storeAdminTokens() → ✅ Active
- setupTokenManagement() → ✅ Active
- adminLogout() → ✅ Active (on error)

---

### Function: setupTokenManagement()
```
Level 0: setupTokenManagement()
    ↓
Level 1:
    - adminLogin()
    - checkStoredAdminTokens()
    - refreshAdminToken()
    ↓
Level 2: [All lead to active root callers]
    ↓
Level 3: App startup, user login, manual refresh
```
**Status**: ✅ ACTIVE

**Calls internally**:
- showTokenExpiryWarning() → ✅ Active (setTimeout callback)
- refreshAdminToken() → ✅ Active (setTimeout callback)

---

### Function: showTokenExpiryWarning()
```
Level 0: showTokenExpiryWarning(minutesRemaining)
    ↓
Level 1: setupTokenManagement() → setTimeout callback
    ↓
Level 2: adminLogin(), checkStoredAdminTokens(), refreshAdminToken()
    ↓
Level 3: Active root callers
```
**Status**: ✅ ACTIVE

**Calls internally**:
- adminLogout() → ✅ Active (on full expiry)

---

### Function: storeAdminTokens()
```
Level 0: storeAdminTokens(token, refreshToken, tokenExpiry)
    ↓
Level 1:
    - adminLogin()
    - refreshAdminToken()
    ↓
Level 2: [See above - both active]
    ↓
Level 3: Active root callers
```
**Status**: ✅ ACTIVE

---

### Function: clearAdminTokens()
```
Level 0: clearAdminTokens()
    ↓
Level 1: adminLogout()
    ↓
Level 2: HTML onclick, refreshAdminToken(), showTokenExpiryWarning()
    ↓
Level 3: Active root callers
```
**Status**: ✅ ACTIVE

---

### Function: checkStoredAdminTokens()
```
Level 0: checkStoredAdminTokens()
    ↓
Level 1: app-init.js → checkStoredAdminTokens() wrapper function
    ↓
Level 2: app-init.js initialization
    ↓
Level 3: App startup (index.html loads app-init.js)
```
**Status**: ✅ ACTIVE - Critical startup function

**Calls internally**:
- setupTokenManagement() → ✅ Active
- connectAndAuthenticate() → ✅ Active

---

### Function: connectAndAuthenticate()
```
Level 0: connectAndAuthenticate(token)
    ↓
Level 1:
    - checkStoredAdminTokens() → startup
    - window.reconnectWebSocket alias → HTML onclick (Reconnect button)
    ↓
Level 2:
    - App startup (app-init.js)
    - Direct user action (Reconnect button)
    ↓
Level 3: Active root callers
```
**Status**: ✅ ACTIVE - Core connection function

---

### Function: showLoginStatus()
```
Level 0: showLoginStatus(message, type)
    ↓
Level 1: adminLogin() → internal error/validation messages
    ↓
Level 2: app-init.js, HTML onclick
    ↓
Level 3: App startup, user login
```
**Status**: ✅ ACTIVE

---

### Function: getAuthState()
```
Level 0: getAuthState()
    ↓
Level 1: ❌ NOT FOUND IN SEARCH RESULTS
    ↓
Level 2: N/A
    ↓
Level 3: N/A
```
**Status**: ⚠️ **POTENTIALLY DEAD** - No active callers found

**Note**: This function was previously called by reconnectWebSocket() in websocket-manager.js, but that function was removed. Need to verify if anything else calls it.

---

### Function: isAuthenticated()
```
Level 0: isAuthenticated()
    ↓
Level 1: ❌ NOT FOUND IN SEARCH RESULTS
    ↓
Level 2: N/A
    ↓
Level 3: N/A
```
**Status**: ⚠️ **POTENTIALLY DEAD** - No active callers found

---

## Summary

### ✅ Active Functions (10/12)
All core authentication and connection functions are actively used:
- adminLogin()
- adminLogout()
- refreshAdminToken()
- setupTokenManagement()
- showTokenExpiryWarning()
- storeAdminTokens()
- clearAdminTokens()
- checkStoredAdminTokens()
- connectAndAuthenticate()
- showLoginStatus()

### ⚠️ Potentially Dead Functions (2/12)

1. **`getAuthState()`**
   - Returns a copy of adminAuthState
   - No callers found in current search
   - Was previously used by removed reconnectWebSocket()
   - May have been orphaned after code consolidation

2. **`isAuthenticated()`**
   - Returns adminAuthState.isAuthenticated boolean
   - No callers found in current search
   - Exported in API but never used
   - Simple getter that may have been planned but not implemented

## Recommendations

### Option 1: Remove Dead Functions
If getAuthState() and isAuthenticated() have no callers, they can be safely removed:
- Remove from window.authManager export object
- Remove function definitions
- Clean up code

### Option 2: Keep as Public API
If these functions are intended as public API for future use or external access:
- Keep them documented
- Add JSDoc comments explaining they're public API
- Accept they're currently unused

### Option 3: Verify Usage
Search more thoroughly to ensure these aren't called by:
- Dynamically generated code
- eval() statements
- External scripts
- Browser console usage (debugging)

## Call Chain Verification

All functions except getAuthState() and isAuthenticated() have verified active call chains leading to:
1. **User Actions**: HTML onclick handlers
2. **App Startup**: app-init.js initialization
3. **Timer Callbacks**: Token expiry management (setTimeout, setInterval)

The two potentially dead functions have no traces in:
- HTML onclick attributes
- JavaScript function calls
- Event listeners
- Timer callbacks
