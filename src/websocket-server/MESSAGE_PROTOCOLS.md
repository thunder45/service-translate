# WebSocket Message Protocols

This document defines the message protocols for the Service Translate local WebSocket server.

## Message Format

All messages follow a consistent JSON format:

```json
{
  "type": "message-type",
  "sessionId": "CHURCH-YYYY-NNN",
  "...additional fields"
}
```

## Session ID Format

Session IDs follow the pattern: `CHURCH-YYYY-NNN`
- `CHURCH`: Fixed prefix
- `YYYY`: 4-digit year
- `NNN`: 3-digit sequential number (001, 002, etc.)

Examples: `CHURCH-2025-001`, `CHURCH-2025-042`

## Admin Authentication Messages

### Admin Authentication (Credentials Method)
Authenticates admin user with Cognito username and password. Used for initial login.

**Authentication Method**: AWS Cognito User Pool with USER_PASSWORD_AUTH flow

**Request:**
```json
{
  "type": "admin-auth",
  "method": "credentials",
  "username": "admin@example.com",
  "password": "securePassword",
  "clientInfo": {
    "appVersion": "2.0.0",
    "platform": "darwin",
    "deviceId": "mac-12345"
  }
}
```

**Success Response:**
```json
{
  "type": "admin-auth-response",
  "success": true,
  "adminId": "550e8400-e29b-41d4-a716-446655440000",
  "username": "admin@example.com",
  "accessToken": "eyJraWQiOiJxxx...cognito-access-token",
  "idToken": "eyJraWQiOiJxxx...cognito-id-token",
  "refreshToken": "eyJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwiYWxnIjoiUlNBLU9BRVAifQ...cognito-refresh-token",
  "expiresIn": 3600,
  "ownedSessions": [
    {
      "sessionId": "CHURCH-2025-001",
      "status": "started",
      "clientCount": 3,
      "createdAt": "2025-01-06T10:00:00.000Z",
      "createdBy": "admin@example.com",
      "isOwner": true,
      "config": {
        "enabledLanguages": ["en", "es", "fr"],
        "ttsMode": "neural"
      }
    }
  ],
  "allSessions": [
    /* All sessions including those owned by other admins */
  ],
  "permissions": {
    "canCreateSessions": true,
    "canViewAllSessions": true,
    "canManageOwnSessions": true,
    "canDeleteOwnSessions": true
  },
  "timestamp": "2025-01-06T10:30:00.000Z"
}
```

**Cognito Token Details:**
- **accessToken**: Cognito access token (JWT) - used for API authorization (1 hour expiry)
- **idToken**: Cognito ID token (JWT) - contains user information
- **refreshToken**: Cognito refresh token (encrypted JWT) - used to obtain new access tokens (30 day expiry)
- **expiresIn**: Access token expiry in seconds (typically 3600 = 1 hour)

**Error Response:**
```json
{
  "type": "admin-error",
  "errorCode": "AUTH_1001",
  "message": "Invalid username or password provided",
  "userMessage": "Invalid username or password. Please check your credentials and try again.",
  "retryable": true,
  "details": {
    "operation": "admin-auth"
  },
  "timestamp": "2025-01-06T10:30:00.000Z"
}
```

### Admin Authentication (Token Method)
Authenticates admin user with existing Cognito access token. Used for reconnection.

**Authentication Method**: Cognito token validation

**Request:**
```json
{
  "type": "admin-auth",
  "method": "token",
  "accessToken": "eyJraWQiOiJxxx...cognito-access-token",
  "clientInfo": {
    "appVersion": "2.0.0",
    "platform": "darwin",
    "deviceId": "mac-12345"
  }
}
```

**Success Response:**
```json
{
  "type": "admin-auth-response",
  "success": true,
  "adminId": "550e8400-e29b-41d4-a716-446655440000",
  "username": "admin@example.com",
  "ownedSessions": [
    /* Sessions owned by this admin */
  ],
  "allSessions": [
    /* All active sessions */
  ],
  "permissions": {
    "canCreateSessions": true,
    "canViewAllSessions": true,
    "canManageOwnSessions": true,
    "canDeleteOwnSessions": true
  },
  "timestamp": "2025-01-06T10:30:00.000Z"
}
```

**Note**: Token-based authentication does not return new tokens. The client should use stored tokens and refresh them when needed.

**Followed by (if sessions were recovered):**
```json
{
  "type": "admin-reconnection",
  "adminId": "550e8400-e29b-41d4-a716-446655440000",
  "username": "admin",
  "recoveredSessions": ["CHURCH-2025-001", "CHURCH-2025-002"],
  "timestamp": "2025-01-06T10:30:00.000Z"
}
```

### Token Refresh
Refreshes expired Cognito access token using Cognito refresh token.

**Authentication Method**: Cognito refresh token flow

**Request:**
```json
{
  "type": "token-refresh",
  "refreshToken": "eyJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwiYWxnIjoiUlNBLU9BRVAifQ...cognito-refresh-token"
}
```

**Success Response:**
```json
{
  "type": "token-refresh-response",
  "success": true,
  "accessToken": "eyJraWQiOiJxxx...new-cognito-access-token",
  "expiresIn": 3600,
  "timestamp": "2025-01-06T11:30:00.000Z"
}
```

**Error Response:**
```json
{
  "type": "admin-error",
  "errorCode": "COGNITO_1007",
  "message": "Refresh token has expired",
  "userMessage": "Your session has expired. Please log in again.",
  "retryable": true,
  "timestamp": "2025-01-06T11:30:00.000Z"
}
```

**Automatic Token Refresh:**
The Capture app automatically checks token expiry every 5 minutes and refreshes if less than 10 minutes remaining. This ensures seamless operation without manual intervention.

### Admin Session Access
Request read-only or write access to a session.

**Request:**
```json
{
  "type": "admin-session-access",
  "sessionId": "CHURCH-2025-001",
  "accessType": "read"
}
```

**Success Response:**
```json
{
  "type": "admin-session-access-response",
  "success": true,
  "sessionId": "CHURCH-2025-001",
  "accessType": "read",
  "sessionData": {
    "sessionId": "CHURCH-2025-001",
    "adminId": "other-admin-id",
    "currentAdminSocketId": "socket-123",
    "createdBy": "other-admin",
    "config": {
      "enabledLanguages": ["en", "es"],
      "ttsMode": "neural",
      "audioQuality": "high"
    },
    "clients": [
      {
        "socketId": "client-socket-1",
        "preferredLanguage": "en",
        "joinedAt": "2025-01-06T10:00:00.000Z",
        "lastSeen": "2025-01-06T10:30:00.000Z",
        "audioCapabilities": {
          "supportsPolly": true,
          "localTTSLanguages": ["en"],
          "audioFormats": ["mp3"]
        }
      }
    ],
    "createdAt": "2025-01-06T10:00:00.000Z",
    "lastActivity": "2025-01-06T10:30:00.000Z",
    "status": "started",
    "isOwner": false,
    "accessType": "read"
  },
  "timestamp": "2025-01-06T10:30:00.000Z"
}
```

**Error Response (Write Access Denied):**
```json
{
  "type": "admin-error",
  "errorCode": "AUTHZ_1102",
  "message": "Admin does not own the specified session",
  "userMessage": "You can only manage sessions that you created.",
  "retryable": false,
  "details": {
    "sessionId": "CHURCH-2025-001",
    "adminId": "550e8400-e29b-41d4-a716-446655440000",
    "operation": "admin-session-access"
  },
  "timestamp": "2025-01-06T10:30:00.000Z"
}
```

## Admin Session Management Messages (Admin App → Server)

### Start Session
Creates a new translation session.

```json
{
  "type": "start-session",
  "sessionId": "CHURCH-2025-001",
  "config": {
    "sessionId": "CHURCH-2025-001",
    "targetLanguages": ["en", "es", "fr", "de", "it"],
    "ttsMode": "neural" | "standard" | "local" | "disabled",
    "audioQuality": "high" | "medium" | "low"
  }
}
```

**Response:** `session-started`

### End Session
Ends an active translation session (admin only).

```json
{
  "type": "end-session",
  "sessionId": "CHURCH-2025-001"
}
```

**Response:** `session-ended` (broadcast to all clients in session)

### Config Update
Updates session configuration during active session.

```json
{
  "type": "config-update",
  "sessionId": "CHURCH-2025-001",
  "config": {
    "sessionId": "CHURCH-2025-001",
    "targetLanguages": ["en", "es"],
    "ttsMode": "standard",
    "audioQuality": "medium"
  }
}
```

**Response:** `config-updated` (broadcast to all clients)

### Translation Broadcast
Sends translation to clients using specific language.

```json
{
  "type": "translation",
  "sessionId": "CHURCH-2025-001",
  "text": "Welcome to our service",
  "language": "en",
  "timestamp": 1704067200000,
  "audioUrl": "http://localhost:3001/audio/abc123.mp3",
  "useLocalTTS": false
}
```

**Response:** Message broadcast to language-specific clients

## Client Messages (Client App → Server)

### Join Session
Client joins an existing session.

```json
{
  "type": "join-session",
  "sessionId": "CHURCH-2025-001",
  "preferredLanguage": "en",
  "audioCapabilities": {
    "supportsPolly": true,
    "localTTSLanguages": ["en", "es"],
    "audioFormats": ["mp3", "wav", "ogg"]
  }
}
```

**Response:** `session-joined` with session metadata

### Leave Session
Client leaves the session.

```json
{
  "type": "leave-session",
  "sessionId": "CHURCH-2025-001"
}
```

**Response:** `session-left`

### Session Ended
Broadcast to all clients when admin ends the session.

```json
{
  "type": "session-ended",
  "sessionId": "CHURCH-2025-001",
  "timestamp": "2025-01-08T19:00:00.000Z"
}
```

**Client Action:** Disconnect from session, show "Session ended" message

### Change Language
Client changes preferred language.

```json
{
  "type": "change-language",
  "sessionId": "CHURCH-2025-001",
  "newLanguage": "es"
}
```

**Response:** `language-changed`

## Server Responses (Server → Client/Admin)

### Session Started
Confirms session creation (to admin).

```json
{
  "type": "session-started",
  "sessionId": "CHURCH-2025-001",
  "config": { /* session config */ },
  "timestamp": "2025-01-06T10:30:00.000Z"
}
```

### Session Joined
Confirms client joined session with metadata.

```json
{
  "type": "session-metadata",
  "config": {
    "sessionId": "CHURCH-2025-001",
    "targetLanguages": ["en", "es", "fr"],
    "ttsMode": "neural",
    "audioQuality": "high"
  },
  "availableLanguages": ["en", "es", "fr"],
  "ttsAvailable": true,
  "audioQuality": "high"
}
```

### Translation Message
Translation sent to clients (language-specific).

```json
{
  "type": "translation",
  "sessionId": "CHURCH-2025-001",
  "text": "Bienvenidos a nuestro servicio",
  "language": "es",
  "timestamp": 1704067200000,
  "audioUrl": "http://localhost:3001/audio/def456.mp3",
  "useLocalTTS": false
}
```

### Config Updated
Notifies clients of configuration changes.

```json
{
  "type": "config-updated",
  "sessionId": "CHURCH-2025-001",
  "config": { /* updated config */ },
  "timestamp": "2025-01-06T10:35:00.000Z"
}
```

### Error Message
Error response for invalid requests.

```json
{
  "type": "error",
  "code": 400,
  "message": "Invalid session ID format. Expected: CHURCH-YYYY-NNN",
  "details": {
    "sessionId": "invalid-id"
  }
}
```

### Admin Error Message
Structured error response with user-friendly messages and retry information.

```json
{
  "type": "admin-error",
  "errorCode": "AUTH_1001",
  "message": "Invalid username or password provided",
  "userMessage": "Invalid username or password. Please check your credentials and try again.",
  "retryable": true,
  "details": {
    "operation": "authentication",
    "adminId": "admin-uuid-here"
  },
  "timestamp": "2025-01-06T10:30:00.000Z"
}
```

### Token Expiry Warning
Warning sent before token expires.

```json
{
  "type": "token-expiry-warning",
  "adminId": "admin-uuid-here",
  "expiresAt": "2025-01-06T11:00:00.000Z",
  "timeRemaining": 300,
  "timestamp": "2025-01-06T10:55:00.000Z"
}
```

## Connection Events

### Connected
Welcome message sent on connection.

```json
{
  "message": "Connected to Service Translate WebSocket Server",
  "socketId": "abc123def456",
  "timestamp": "2025-01-06T10:30:00.000Z"
}
```

### Ping/Pong
Health check mechanism.

**Client sends:** `ping`
**Server responds:** 
```json
{
  "timestamp": "2025-01-06T10:30:00.000Z"
}
```

## Language-Specific Broadcasting

The server maintains language-specific client groups for efficient broadcasting:

1. **Admin sends translation** for language "es"
2. **Server identifies clients** with `preferredLanguage: "es"`
3. **Server broadcasts** only to those clients
4. **Other language clients** don't receive the message

## Error Codes

### Standard HTTP-style Codes
- **400**: Bad Request (invalid message format, validation failed)
- **404**: Not Found (session doesn't exist)
- **500**: Internal Server Error

### Admin Error Codes (AdminErrorCode enum)

All admin error messages follow this structure:
```json
{
  "type": "admin-error",
  "errorCode": "ERROR_CODE",
  "message": "Technical error description",
  "userMessage": "User-friendly error message",
  "retryable": true/false,
  "retryAfter": 30,  // Optional: seconds to wait before retry
  "details": {
    "sessionId": "CHURCH-2025-001",
    "operation": "operation-name",
    "adminId": "admin-uuid",
    "validationErrors": ["error1", "error2"]
  },
  "timestamp": "2025-01-06T10:30:00.000Z"
}
```

#### Authentication Errors (1000-1099)

| Code | Message | User Message | Retryable | Retry After |
|------|---------|--------------|-----------|-------------|
| **AUTH_1001** | Invalid username or password provided | Invalid username or password. Please check your credentials and try again. | Yes | - |
| **AUTH_1002** | Authentication token has expired | Your session has expired. Please log in again. | Yes | - |
| **AUTH_1003** | Authentication token is invalid or malformed | Authentication error. Please log in again. | Yes | - |
| **AUTH_1004** | Refresh token has expired | Your session has expired. Please log in again. | Yes | - |
| **AUTH_1005** | Refresh token is invalid or malformed | Authentication error. Please log in again. | Yes | - |
| **AUTH_1006** | Authentication session not found | Session not found. Please log in again. | Yes | - |
| **AUTH_1007** | Too many authentication attempts | Too many login attempts. Please wait before trying again. | Yes | 300s (5 min) |
| **AUTH_1008** | Account has been locked due to security reasons | Account locked. Please contact administrator. | No | - |

#### Cognito-Specific Errors (1050-1099)

| Code | Message | User Message | Retryable | Retry After | Recovery Action |
|------|---------|--------------|-----------|-------------|-----------------|
| **COGNITO_1001** | Invalid Cognito credentials | Invalid username or password. Please check your credentials and try again. | Yes | - | Verify username and password are correct. Check Cognito User Pool for user status. |
| **COGNITO_1002** | Cognito access token has expired | Your session has expired. Please refresh or log in again. | Yes | - | Client should automatically refresh token. If refresh fails, re-authenticate. |
| **COGNITO_1003** | Cognito token is invalid or malformed | Authentication error. Please log in again. | Yes | - | Clear stored tokens and re-authenticate. Check token format and signature. |
| **COGNITO_1004** | Cognito user not found | User not found. Please contact administrator. | No | - | User may have been deleted from Cognito. Create new user or use existing user. |
| **COGNITO_1005** | Cognito user account is disabled | Your account is disabled. Please contact administrator. | No | - | Enable user account in Cognito User Pool console. |
| **COGNITO_1006** | Unable to connect to Cognito service | Authentication service unavailable. Please try again later. | Yes | 30s | Check network connectivity. Verify Cognito User Pool ID and region are correct. |
| **COGNITO_1007** | Cognito refresh token has expired | Your session has expired. Please log in again. | Yes | - | Re-authenticate with username and password. Sessions will be preserved. |
| **COGNITO_1008** | Insufficient Cognito permissions | You do not have required permissions. | No | - | Verify user has required Cognito groups (if RBAC is enabled). |

#### Authorization Errors (1100-1199)

| Code | Message | User Message | Retryable | Retry After |
|------|---------|--------------|-----------|-------------|
| **AUTHZ_1101** | Access denied for requested operation | You do not have permission to perform this action. | No | - |
| **AUTHZ_1102** | Admin does not own the specified session | You can only manage sessions that you created. | No | - |
| **AUTHZ_1103** | Insufficient permissions for requested operation | You do not have sufficient permissions for this action. | No | - |
| **AUTHZ_1104** | Operation not allowed in current context | This operation is not allowed at this time. | No | - |

#### Session Management Errors (1200-1299)

| Code | Message | User Message | Retryable | Retry After |
|------|---------|--------------|-----------|-------------|
| **SESSION_1201** | Specified session does not exist | Session not found. It may have been deleted or expired. | No | - |
| **SESSION_1202** | Session with this ID already exists | A session with this ID already exists. Please choose a different ID. | Yes | - |
| **SESSION_1203** | Session configuration is invalid | Invalid session configuration. Please check your settings. | Yes | - |
| **SESSION_1204** | Failed to create session | Failed to create session. Please try again. | Yes | 5s |
| **SESSION_1205** | Failed to update session | Failed to update session. Please try again. | Yes | 5s |
| **SESSION_1206** | Failed to delete session | Failed to delete session. Please try again. | Yes | 5s |
| **SESSION_1207** | Session has reached maximum client limit | Session is full. Maximum number of clients reached. | No | - |

#### Admin Identity Errors (1300-1399)

| Code | Message | User Message | Retryable | Retry After |
|------|---------|--------------|-----------|-------------|
| **ADMIN_1301** | Admin identity not found | Admin account not found. Please contact administrator. | No | - |
| **ADMIN_1302** | Failed to create admin identity | Failed to create admin account. Please try again. | Yes | 10s |
| **ADMIN_1303** | Username is already taken | Username is already in use. Please choose a different username. | Yes | - |
| **ADMIN_1304** | Admin identity data is corrupted | Account data error. Please contact administrator. | No | - |

#### System Errors (1400-1499)

| Code | Message | User Message | Retryable | Retry After |
|------|---------|--------------|-----------|-------------|
| **SYSTEM_1401** | Internal server error occurred | An unexpected error occurred. Please try again later. | Yes | 30s |
| **SYSTEM_1402** | Database operation failed | System error. Please try again later. | Yes | 60s |
| **SYSTEM_1403** | Network communication error | Network error. Please check your connection and try again. | Yes | 10s |
| **SYSTEM_1404** | System rate limit exceeded | Too many requests. Please wait before trying again. | Yes | 60s |
| **SYSTEM_1405** | System is in maintenance mode | System is under maintenance. Please try again later. | Yes | 300s (5 min) |
| **SYSTEM_1406** | Maximum connection limit exceeded | Server is at capacity. Please try again later. | Yes | 120s (2 min) |

#### Validation Errors (1500-1599)

| Code | Message | User Message | Retryable | Retry After |
|------|---------|--------------|-----------|-------------|
| **VALIDATION_1501** | Invalid input provided | Invalid input. Please check your data and try again. | Yes | - |
| **VALIDATION_1502** | Required field is missing | Required information is missing. Please complete all fields. | Yes | - |
| **VALIDATION_1503** | Session ID format is invalid | Invalid session ID format. Please check and try again. | Yes | - |
| **VALIDATION_1504** | Invalid language code provided | Invalid language selection. Please choose a supported language. | Yes | - |
| **VALIDATION_1505** | Configuration validation failed | Invalid configuration. Please check your settings. | Yes | - |

### Error Response Structure

Each error code includes:
- **message**: Technical error description for logging and debugging
- **userMessage**: User-friendly error message for UI display
- **retryable**: Boolean indicating whether the operation can be retried
- **retryAfter**: Optional number of seconds to wait before retry (for rate-limited operations)
- **details**: Optional object with additional context (sessionId, operation, adminId, validationErrors)

## Message Validation

All messages are validated for:
- **Type**: Must be a recognized message type
- **Session ID**: Must match `CHURCH-YYYY-NNN` pattern
- **Languages**: Must be one of `en`, `es`, `fr`, `de`, `it`
- **TTS Mode**: Must be `neural`, `standard`, `local`, or `disabled`
- **Audio Quality**: Must be `high`, `medium`, or `low`
- **Required Fields**: All required fields must be present and valid

## Example Client Flow

1. **Connect** to WebSocket server
2. **Receive** welcome message
3. **Send** `join-session` message
4. **Receive** `session-metadata` response
5. **Receive** `translation` messages for preferred language
6. **Send** `change-language` to switch languages
7. **Send** `leave-session` when done

## Complete Admin Authentication Flow

### Initial Login Flow
1. **Connect** to WebSocket server
2. **Send** `admin-auth` message with `method: "credentials"`
3. **Receive** `admin-auth-response` with JWT token and refresh token
4. **Store** tokens securely for future use
5. **Receive** list of owned sessions and all sessions
6. **Start** using admin features (create sessions, manage sessions, etc.)

### Reconnection Flow
1. **Connect** to WebSocket server
2. **Send** `admin-auth` message with `method: "token"` and stored JWT token
3. **Receive** `admin-auth-response` with session list
4. **Receive** `admin-reconnection` notification with recovered sessions
5. **Resume** managing previously created sessions

### Token Refresh Flow
1. **Receive** `token-expiry-warning` (5 minutes before expiry)
2. **Send** `token-refresh` message with refresh token
3. **Receive** `token-refresh-response` with new tokens
4. **Update** stored tokens
5. **Continue** normal operations

### Session Expired Flow
1. **Receive** `session-expired` notification
2. **Clear** stored tokens
3. **Redirect** user to login screen
4. **Restart** authentication flow with credentials

## Example Admin Flow

### Creating and Managing a Session
1. **Authenticate** using credentials or token
2. **Send** `start-session` message with session config
3. **Receive** `start-session-response` confirmation
4. **Send** `broadcast-translation` messages to clients
5. **Send** `update-session-config` to change settings
6. **Send** `end-session` when done

### Viewing Other Admin's Sessions
1. **Authenticate** as admin
2. **Send** `list-sessions` with `filter: "all"`
3. **Receive** `list-sessions-response` with all sessions
4. **Send** `admin-session-access` with `accessType: "read"` for specific session
5. **Receive** `admin-session-access-response` with read-only session data
6. **View** session details but cannot modify

## Admin Authentication Troubleshooting

### Common Authentication Issues

#### Invalid Credentials
**Error:** `AUTH_1001 - Invalid username or password`
**Solution:**
- Verify username and password are correct
- Check for typos or extra spaces
- Ensure credentials match server configuration
- Contact administrator if credentials are forgotten

#### Token Expired
**Error:** `AUTH_1002 - Authentication token has expired`
**Solution:**
- Use refresh token to get new access token
- If refresh token also expired, re-authenticate with credentials
- Check system clock is synchronized

#### Token Invalid
**Error:** `AUTH_1003 - Authentication token is invalid`
**Solution:**
- Token may be corrupted or tampered with
- Re-authenticate with credentials
- Clear stored tokens and start fresh

#### Rate Limited
**Error:** `AUTH_1007 - Too many authentication attempts`
**Solution:**
- Wait 5 minutes before trying again
- Check for automated scripts making too many requests
- Verify no infinite retry loops in client code

### Common Authorization Issues

#### Session Not Owned
**Error:** `AUTHZ_1102 - Admin does not own the specified session`
**Solution:**
- You can only modify sessions you created
- Use `admin-session-access` with `accessType: "read"` to view session
- Contact session owner for modifications

#### Access Denied
**Error:** `AUTHZ_1101 - Access denied for requested operation`
**Solution:**
- Check admin permissions
- Verify you're authenticated
- Ensure operation is allowed for your role

### Common Session Management Issues

#### Session Not Found
**Error:** `SESSION_1201 - Specified session does not exist`
**Solution:**
- Session may have been deleted or expired
- Verify session ID is correct
- Use `list-sessions` to see available sessions

#### Session Creation Failed
**Error:** `SESSION_1204 - Failed to create session`
**Solution:**
- Check session ID format (CHURCH-YYYY-NNN)
- Verify session ID is unique
- Check session configuration is valid
- Retry after a few seconds

### Token Management Best Practices

1. **Store Tokens Securely**
   - Use secure storage (Keychain on macOS, Credential Manager on Windows)
   - Never log tokens to console or files
   - Clear tokens on logout

2. **Handle Token Expiry Gracefully**
   - Listen for `token-expiry-warning` messages
   - Automatically refresh tokens before expiry
   - Implement fallback to credential authentication

3. **Implement Retry Logic**
   - Use exponential backoff for retryable errors
   - Respect `retryAfter` values in error responses
   - Limit maximum retry attempts

4. **Monitor Token Status**
   - Check token expiry before critical operations
   - Refresh proactively if expiring soon
   - Handle `session-expired` notifications immediately

## Client-Side Error Handling Best Practices

### Retry Strategies

Implement exponential backoff for retryable errors:

```typescript
interface RetryStrategy {
  maxAttempts: number;
  baseDelay: number;        // milliseconds
  maxDelay: number;         // milliseconds
  backoffMultiplier: number;
  retryableErrors: string[];
}

const DEFAULT_RETRY_STRATEGY: RetryStrategy = {
  maxAttempts: 3,
  baseDelay: 1000,          // 1 second
  maxDelay: 30000,          // 30 seconds
  backoffMultiplier: 2,
  retryableErrors: [
    'SYSTEM_1401',  // Internal error
    'SYSTEM_1403',  // Network error
    'AUTH_1002',    // Token expired
    'SESSION_1204', // Session creation failed
    'SESSION_1205'  // Session update failed
  ]
};

async function retryOperation<T>(
  operation: () => Promise<T>,
  strategy: RetryStrategy = DEFAULT_RETRY_STRATEGY
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt < strategy.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Check if error is retryable
      if (!strategy.retryableErrors.includes(error.errorCode)) {
        throw error;
      }
      
      // Check if we have more attempts
      if (attempt === strategy.maxAttempts - 1) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        strategy.baseDelay * Math.pow(strategy.backoffMultiplier, attempt),
        strategy.maxDelay
      );
      
      // Respect server's retryAfter if provided
      const actualDelay = error.retryAfter 
        ? error.retryAfter * 1000 
        : delay;
      
      await new Promise(resolve => setTimeout(resolve, actualDelay));
    }
  }
  
  throw lastError!;
}
```

### Error Display Guidelines

#### Transient Errors (Retryable)
Show toast notification with retry option:
```typescript
showToast({
  type: 'error',
  message: error.userMessage,
  action: {
    label: 'Retry',
    onClick: () => retryOperation()
  },
  duration: 5000
});
```

#### Authentication Errors
Redirect to login screen with error message:
```typescript
if (error.errorCode.startsWith('AUTH_')) {
  clearStoredTokens();
  redirectToLogin({
    message: error.userMessage,
    returnUrl: currentUrl
  });
}
```

#### Authorization Errors
Show modal dialog explaining access restrictions:
```typescript
showModal({
  title: 'Access Denied',
  message: error.userMessage,
  type: 'warning',
  buttons: [
    { label: 'OK', onClick: closeModal }
  ]
});
```

#### System Errors
Show error banner with retry button and support contact:
```typescript
showErrorBanner({
  message: error.userMessage,
  retryable: error.retryable,
  retryAfter: error.retryAfter,
  supportLink: 'mailto:support@example.com'
});
```

#### Validation Errors
Show inline validation errors on form fields:
```typescript
if (error.details?.validationErrors) {
  error.details.validationErrors.forEach(validationError => {
    showFieldError(fieldName, validationError);
  });
}
```

### Automatic Recovery Scenarios

#### 1. Token Expiry Recovery
```typescript
// Listen for token expiry warning
ws.on('message', (data) => {
  const message = JSON.parse(data);
  
  if (message.type === 'token-expiry-warning') {
    // Automatically refresh token
    refreshToken(message.adminId);
  }
  
  if (message.type === 'session-expired') {
    // Token expired, need re-authentication
    clearTokens();
    redirectToLogin();
  }
});

async function refreshToken(adminId: string) {
  try {
    const refreshToken = getStoredRefreshToken();
    const response = await sendMessage({
      type: 'token-refresh',
      refreshToken,
      adminId
    });
    
    if (response.success) {
      storeTokens(response.token, response.refreshToken);
    }
  } catch (error) {
    // Refresh failed, need re-authentication
    clearTokens();
    redirectToLogin();
  }
}
```

#### 2. Network Disconnection Recovery
```typescript
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

ws.on('close', () => {
  if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
    
    setTimeout(() => {
      reconnectAttempts++;
      reconnectWithToken();
    }, delay);
  } else {
    showError('Unable to reconnect. Please refresh the page.');
  }
});

async function reconnectWithToken() {
  const token = getStoredToken();
  
  if (!token) {
    redirectToLogin();
    return;
  }
  
  try {
    await connectWebSocket();
    await authenticate({ method: 'token', token });
    reconnectAttempts = 0; // Reset on success
  } catch (error) {
    // Will retry via close handler
  }
}
```

#### 3. Session State Recovery
```typescript
// On reconnection, request current session list
async function recoverSessionState() {
  try {
    const response = await sendMessage({
      type: 'list-sessions',
      filter: 'owned'
    });
    
    // Compare with local state
    const localSessions = getLocalSessionState();
    const serverSessions = response.sessions;
    
    // Update UI to reflect current server state
    updateSessionList(serverSessions);
    
    // Notify user of any changes
    const deletedSessions = localSessions.filter(
      local => !serverSessions.find(server => server.sessionId === local.sessionId)
    );
    
    if (deletedSessions.length > 0) {
      showNotification({
        message: `${deletedSessions.length} session(s) were ended while you were disconnected`,
        type: 'info'
      });
    }
  } catch (error) {
    console.error('Failed to recover session state:', error);
  }
}
```

### Rate Limiting Handling

```typescript
function handleRateLimitError(error: AdminErrorMessage) {
  const retryAfter = error.retryAfter || 60;
  
  // Show countdown timer
  showRateLimitNotification({
    message: error.userMessage,
    retryAfter,
    onCountdownComplete: () => {
      // Enable retry button
      enableRetryButton();
    }
  });
  
  // Disable operation buttons
  disableOperationButtons();
  
  // Start countdown
  startCountdown(retryAfter);
}
```

### Security Considerations

1. **Authentication**
   - Always use HTTPS/WSS in production
   - Never expose JWT secrets
   - Rotate JWT secrets periodically (every 90 days)
   - Use strong passwords for admin accounts

2. **Token Security**
   - Tokens are bearer tokens - protect them like passwords
   - Implement token revocation on logout
   - Clear tokens from memory when not needed
   - Monitor for suspicious token usage

3. **Session Ownership**
   - Session ownership is immutable
   - Only session creator can modify session
   - All admins can view all sessions (read-only)
   - Audit logs track all admin actions

4. **Rate Limiting**
   - Authentication attempts are rate limited
   - Failed attempts trigger temporary lockout
   - Implement client-side rate limiting
   - Monitor for brute force attempts

## Security Event Logging and Audit Trail

### Security Event Types

The server logs the following security events:

1. **Authentication Events**
   - Failed login attempts (AUTH_1001)
   - Token expiry (AUTH_1002)
   - Invalid token usage (AUTH_1003)
   - Rate limit exceeded (AUTH_1007)
   - Account lockout (AUTH_1008)

2. **Authorization Events**
   - Access denied (AUTHZ_1101)
   - Session ownership violation (AUTHZ_1102)
   - Insufficient permissions (AUTHZ_1103)
   - Unauthorized operation attempt (AUTHZ_1104)

3. **Session Management Events**
   - Session creation
   - Session deletion
   - Session configuration changes
   - Unauthorized session access attempts

### Audit Trail Format

Security events are logged with the following structure:

```json
{
  "timestamp": "2025-01-06T10:30:00.000Z",
  "eventType": "security",
  "errorCode": "AUTH_1001",
  "adminId": "550e8400-e29b-41d4-a716-446655440000",
  "operation": "admin-auth",
  "details": {
    "username": "admin",
    "ipAddress": "192.168.1.100",
    "userAgent": "ServiceTranslate/2.0.0",
    "success": false,
    "reason": "invalid-credentials"
  }
}
```

### Audit Trail Access

Administrators can access security events through:

1. **Server Logs**: All security events are written to the error log
2. **In-Memory Cache**: Last 1000 security events are kept in memory
3. **Admin API**: Query security events for specific admin or time range

### Security Event Retention

- **In-Memory**: Last 1000 events
- **Log Files**: Retained according to log rotation policy (default: 30 days)
- **Cleanup**: Old events are automatically cleaned up after 30 days

### Monitoring and Alerting

Implement monitoring for:

1. **Failed Authentication Attempts**
   - Alert on > 5 failed attempts from same IP in 5 minutes
   - Alert on > 10 failed attempts for same username in 1 hour

2. **Authorization Violations**
   - Alert on repeated access denied errors
   - Alert on session ownership violations

3. **Rate Limiting**
   - Alert on frequent rate limit hits
   - Monitor for potential DoS attacks

4. **Token Issues**
   - Alert on high rate of token expiry errors
   - Monitor for token validation failures

## Testing

Use the included test client:

```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Run test client
npm test
```

The test client demonstrates the complete message flow for both admin and client operations.