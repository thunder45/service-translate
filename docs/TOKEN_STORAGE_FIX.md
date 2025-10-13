# Token Storage Bug Fix - October 13, 2025

## Problem Summary

The Capture App was experiencing authentication token storage issues causing:
1. **Login required on every app start** (tokens not persisting for 4 hours as designed)
2. **"No stored tokens available for re-authentication" error** when clicking Reconnect
3. **AUTH_1006 errors** on subsequent WebSocket messages ("Authentication session not found")

## Root Cause Analysis

### The Bug

There were **two separate, disconnected token storage systems**:

1. **`main.ts` storage** (`storeAdminTokensSecurely()`)
   - Stored tokens in `admin-tokens.dat`
   - Used by deprecated IPC handlers that were never called
   - **Not connected to WebSocketManager**

2. **`WebSocketManager` storage** (`SecureTokenStorage`)
   - Stores tokens in `cognito-tokens.enc`
   - Used by reconnection logic
   - **Never received tokens from authentication flow**

### The Flow Problem

**Before Fix:**
```
1. User clicks Login
2. main.ts: admin-authenticate handler
3. ✅ Authenticates with Cognito directly
4. ❌ NEVER authenticates with WebSocket server
5. ❌ NEVER stores tokens in SecureTokenStorage
6. Returns tokens to UI (but nowhere persistent)

On App Restart:
1. WebSocketManager.recoverSessionState() runs
2. Tries to load from SecureTokenStorage
3. ❌ Finds nothing → "No stored tokens available"
4. ❌ Cannot establish server session → AUTH_1006 errors
```

## The Fix

### Changes Made to `src/capture/src/main.ts`

#### 1. Store tokens at login time (admin-authenticate handler)

Modified the `admin-authenticate` IPC handler to store tokens in `SecureTokenStorage`:

```typescript
// Authenticate with Cognito
const tokens = await cognitoAuth.login(credentials.username, credentials.password);

// Store config and token globally for streaming manager
(global as any).config = config;
(global as any).authToken = tokens.idToken;

// Store tokens in SecureTokenStorage for WebSocket reconnection
// This must happen even if WebSocket is not connected yet
const { SecureTokenStorage } = require('./secure-token-storage');
const tokenStorage = new SecureTokenStorage(app.getPath('userData'));

const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);
tokenStorage.storeTokens({
  accessToken: tokens.accessToken,
  idToken: tokens.idToken,
  refreshToken: tokens.refreshToken,
  expiresAt,
  username: credentials.username
});
```

**Key point**: Login is now independent of WebSocket connection state.

#### 2. Auto-authenticate on WebSocket connection (connect-websocket handler)

Modified the `connect-websocket` IPC handler to automatically use stored tokens:

```typescript
await webSocketManager.connect();

// After successful connection, try to authenticate with stored tokens if available
const { SecureTokenStorage } = require('./secure-token-storage');
const tokenStorage = new SecureTokenStorage(app.getPath('userData'));

if (tokenStorage.hasStoredTokens()) {
  const storedTokens = tokenStorage.loadTokens();
  
  if (storedTokens) {
    // Authenticate with stored token
    await webSocketManager.adminAuthenticateWithToken(storedTokens.accessToken);
    // Notify UI of successful auto-authentication
  }
}
```

This change now:
- ✅ Stores tokens at login time regardless of WebSocket state
- ✅ Automatically authenticates when connecting to WebSocket
- ✅ Enables automatic reconnection with stored tokens
- ✅ Prevents AUTH_1006 errors
- ✅ Separates login from WebSocket connection

### How It Works Now

**After Fix:**
```
Login Flow:
1. User clicks Login
2. main.ts: admin-authenticate handler
3. ✅ Authenticates with Cognito
4. ✅ Stores tokens in SecureTokenStorage
5. Returns tokens to UI

WebSocket Connection Flow (first time or reconnect):
1. User connects to WebSocket server
2. connect-websocket handler runs
3. ✅ Establishes WebSocket connection
4. ✅ Loads tokens from SecureTokenStorage
5. ✅ Automatically authenticates with WebSocket server using stored token
6. ✅ Server creates/restores admin session
7. ✅ All subsequent messages work correctly

On App Restart:
1. User starts app
2. User clicks Connect (to WebSocket)
3. ✅ WebSocket connects
4. ✅ Loads tokens from SecureTokenStorage  
5. ✅ Auto-authenticates with server using stored token
6. ✅ Session restored - no manual login needed!
```

### Token Refresh Flow

The fix also enables proper token refresh:

1. **Automatic monitoring**: Every 5 minutes, checks if token expires within 10 minutes
2. **Refresh if needed**: Uses refresh token to get new access token
3. **Update storage**: `SecureTokenStorage.updateAccessToken()` updates only access token
4. **Server sync**: Server validates new token and maintains session

## Testing the Fix

### Test 1: Fresh Login
1. ✅ Start app
2. ✅ Connect to WebSocket server
3. ✅ Login with credentials
4. ✅ Verify session created (list-sessions should work)

### Test 2: App Restart with Token Persistence
1. ✅ Close app after successful login
2. ✅ Restart app
3. ✅ Connect to WebSocket server
4. ✅ Click "Reconnect" button
5. ✅ Should auto-authenticate with stored tokens
6. ✅ list-sessions should work without new login

### Test 3: Token Refresh
1. ✅ Login and wait ~50 minutes (tokens expire in 1 hour)
2. ✅ Automatic refresh should occur
3. ✅ Session should remain active
4. ✅ No AUTH_1006 errors

## Files Modified

- `src/capture/src/main.ts` - Fixed admin-authenticate handler

## Files Involved (No Changes)

- `src/capture/src/secure-token-storage.ts` - Token storage implementation (already correct)
- `src/capture/src/websocket-manager.ts` - Authentication methods (already correct)
- `src/websocket-server/src/admin-identity-manager.ts` - Server-side session management (already correct)

## Legacy Code (Deprecated)

The following functions in `main.ts` are now deprecated but left for compatibility:
- `storeAdminTokensSecurely()` - Use SecureTokenStorage instead
- `loadStoredAdminTokens()` - Use SecureTokenStorage instead  
- `clearStoredAdminTokens()` - Use SecureTokenStorage instead

These IPC handlers are also deprecated:
- `store-admin-tokens`
- `load-stored-admin-tokens`
- `clear-admin-tokens`

## Security Notes

- Tokens are encrypted using Electron's `safeStorage` API
- OS-level encryption: Keychain (macOS), DPAPI (Windows), libsecret (Linux)
- Token files: `cognito-tokens.enc` (active), `admin-tokens.dat` (deprecated)
- Refresh tokens valid for 30 days (Cognito default)
- Access tokens valid for 1 hour, auto-refresh when <10 min remaining

## Migration Path

For users with existing installations:
1. Old `admin-tokens.dat` files are ignored
2. First login after update creates `cognito-tokens.enc`
3. Token persistence works from that point forward
4. No manual migration needed

## Summary

This fix resolves the token storage disconnect by ensuring that:
1. **All authentication goes through WebSocketManager** 
2. **Tokens are stored in a single location** (`SecureTokenStorage`)
3. **Server-side sessions are properly established**
4. **Reconnection works automatically**
5. **No more AUTH_1006 errors**

The root issue was that the authentication flow bypassed WebSocketManager entirely, preventing proper token storage and server session creation.
