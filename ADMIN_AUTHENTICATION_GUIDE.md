# Admin Authentication System Guide

**Service Translate - Persistent Admin Session Management**

## Overview

The Admin Authentication System provides persistent admin identity management for the WebSocket server, allowing admins to reconnect and regain control of their previously created sessions. This solves the issue where admins would lose control of sessions after network disconnections or application restarts.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Key Features](#key-features)
3. [Setup and Configuration](#setup-and-configuration)
4. [Admin Authentication Flow](#admin-authentication-flow)
5. [Session Management](#session-management)
6. [Security Considerations](#security-considerations)
7. [Troubleshooting](#troubleshooting)
8. [API Reference](#api-reference)

## Architecture Overview

### Components

```
┌─────────────────────────────────────────────────────────┐
│                  Capture Electron App                    │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Admin Authentication UI                         │  │
│  │  - Login form (username/password)                │  │
│  │  - Token storage and refresh                     │  │
│  │  - Session recovery on reconnection              │  │
│  └──────────────────┬───────────────────────────────┘  │
└─────────────────────┼──────────────────────────────────┘
                      │
                      │ WebSocket + JWT
                      │
┌─────────────────────▼──────────────────────────────────┐
│              WebSocket Server                           │
│  ┌──────────────────────────────────────────────────┐  │
│  │  AdminIdentityManager                            │  │
│  │  - Admin connection tracking                     │  │
│  │  - Session ownership verification                │  │
│  │  - JWT token generation/validation               │  │
│  └──────────────────┬───────────────────────────────┘  │
│                     │                                   │
│  ┌──────────────────▼───────────────────────────────┐  │
│  │  AdminIdentityStore (File-based)                 │  │
│  │  - Persistent admin identities                   │  │
│  │  - Session ownership tracking                    │  │
│  │  - Token management                              │  │
│  │  - Lifecycle management (90-day retention)       │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Initial Authentication:**
   - Admin enters credentials in Capture app
   - Credentials sent to WebSocket server
   - Server validates and creates/retrieves admin identity
   - Server generates JWT access token and refresh token
   - Tokens returned to client with session list

2. **Token-Based Reconnection:**
   - Client reconnects with stored JWT token
   - Server validates token and retrieves admin identity
   - Server returns session list and updates connection
   - Admin regains control of owned sessions

3. **Session Management:**
   - Admin creates session → linked to admin identity
   - Admin disconnects → session remains with admin identity
   - Admin reconnects → session control restored
   - Multiple connections → all can manage same admin's sessions

## Key Features

### 1. Persistent Admin Identity

Each admin is assigned a persistent UUID-based identifier that remains constant across connections:

```typescript
interface AdminIdentity {
  adminId: string;           // UUID v4 persistent identifier
  username: string;          // Display name (unique)
  createdAt: Date;
  lastSeen: Date;
  activeSockets: Set<string>; // Current connections
  ownedSessions: Set<string>; // Sessions created by admin
  tokenVersion: number;       // For token invalidation
  refreshTokens: Set<string>; // Active refresh tokens
}
```

### 2. JWT-Based Authentication

- **Access Tokens**: Short-lived (default: 1 hour) for API operations
- **Refresh Tokens**: Long-lived (default: 30 days) for obtaining new access tokens
- **Token Expiry Warnings**: Sent 5 minutes before expiration
- **Automatic Refresh**: Client can refresh tokens without re-authentication

### 3. Session Ownership

Sessions are permanently linked to the admin who created them:

```typescript
interface SessionData {
  sessionId: string;
  adminId: string;                    // Persistent admin owner
  currentAdminSocketId: string | null; // Current connection
  createdBy: string;                  // Username for display
  // ... other fields
}
```

### 4. Multi-Admin Support

- Multiple admins can connect simultaneously
- Each admin can only manage their own sessions
- All admins can view all sessions (read-only for others' sessions)
- Multiple connections from same admin are supported

### 5. File-Based Persistence

Admin identities are stored in JSON files for persistence:

```
./admin-identities/
├── admin-index.json          # Username to adminId mapping
├── {adminId}.json            # Individual admin identity files
└── cleanup-log.json          # Cleanup operation log
```

## Setup and Configuration

### 1. Initial Setup

Run the admin setup script to configure credentials:

```bash
cd src/websocket-server
./setup-admin.sh
```

The script will:
- Prompt for admin username (default: admin)
- Prompt for admin password (minimum 8 characters)
- Generate JWT secret (256-bit random)
- Create admin identities directory
- Create sessions directory
- Update .env file with configuration

### 2. Environment Configuration

Key environment variables in `.env`:

```bash
# Admin Authentication
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password
ADMIN_IDENTITIES_DIR=./admin-identities
ADMIN_IDENTITY_CLEANUP_ENABLED=true
ADMIN_IDENTITY_RETENTION_DAYS=90
ADMIN_IDENTITY_CLEANUP_INTERVAL_MS=86400000

# JWT Configuration
JWT_SECRET=auto-generated-secret
JWT_ALGORITHM=HS256
JWT_ISSUER=service-translate-ws
JWT_AUDIENCE=service-translate-admin
JWT_ACCESS_TOKEN_EXPIRY=1h
JWT_REFRESH_TOKEN_EXPIRY=30d
JWT_TOKEN_EXPIRY_WARNING_MINUTES=5
JWT_ENABLE_BLACKLIST=true
JWT_BLACKLIST_CLEANUP_INTERVAL_MS=3600000

# Session Configuration
SESSION_PERSISTENCE_DIR=./sessions
SESSION_TIMEOUT_MINUTES=480
SESSION_CLEANUP_ENABLED=true
SESSION_CLEANUP_INTERVAL_MS=3600000
```

### 3. Data Migration

If you have existing sessions from the old format, run the migration script:

```bash
cd src/websocket-server
./migrate-admin-sessions.sh
```

The script will:
- Backup existing session files
- Convert old `adminSocketId` format to new `adminId` format
- Create system admin identity for orphaned sessions
- Generate migration log
- Provide rollback instructions

## Admin Authentication Flow

### Credential-Based Authentication

```typescript
// Client sends authentication request
{
  type: 'admin-auth',
  method: 'credentials',
  username: 'admin',
  password: 'your-password',
  clientInfo: {
    appVersion: '1.0.0',
    platform: 'darwin',
    deviceId: 'unique-device-id'
  }
}

// Server responds with tokens and sessions
{
  type: 'admin-auth-response',
  success: true,
  adminId: 'uuid-v4-admin-id',
  username: 'admin',
  token: 'jwt-access-token',
  tokenExpiry: '2025-10-09T18:30:00.000Z',
  refreshToken: 'jwt-refresh-token',
  ownedSessions: [...],  // Sessions owned by this admin
  allSessions: [...],    // All active sessions
  permissions: {
    canCreateSessions: true,
    canViewAllSessions: true,
    canManageOwnSessions: true,
    canDeleteOwnSessions: true
  }
}
```

### Token-Based Reconnection

```typescript
// Client reconnects with stored token
{
  type: 'admin-auth',
  method: 'token',
  token: 'stored-jwt-access-token'
}

// Server validates and responds
{
  type: 'admin-auth-response',
  success: true,
  adminId: 'uuid-v4-admin-id',
  username: 'admin',
  ownedSessions: [...],
  allSessions: [...]
}
```

### Token Refresh

```typescript
// Client requests token refresh
{
  type: 'token-refresh',
  refreshToken: 'stored-refresh-token',
  adminId: 'uuid-v4-admin-id'
}

// Server responds with new tokens
{
  type: 'token-refresh-response',
  success: true,
  token: 'new-jwt-access-token',
  tokenExpiry: '2025-10-09T19:30:00.000Z',
  refreshToken: 'new-jwt-refresh-token'
}
```

## Session Management

### Creating a Session

```typescript
// Admin creates session (requires authentication)
{
  type: 'start-session',
  sessionId: 'CHURCH-2025-001',
  config: {
    enabledLanguages: ['en', 'es', 'fr'],
    ttsMode: 'neural',
    audioQuality: 'high',
    audioCaching: true
  }
}

// Server creates session linked to admin
{
  type: 'start-session-response',
  success: true,
  sessionId: 'CHURCH-2025-001',
  adminId: 'uuid-v4-admin-id',
  config: {...}
}
```

### Session Ownership Verification

The server automatically verifies admin ownership for all session operations:

- **Create Session**: Automatically linked to authenticated admin
- **End Session**: Only owner can end their sessions
- **Update Config**: Only owner can modify session configuration
- **View Session**: All admins can view, only owner can modify

### Multi-Admin Scenarios

```typescript
// Admin A creates session
Admin A → Server: start-session (CHURCH-001)
Server: Links session to Admin A's identity

// Admin B tries to end Admin A's session
Admin B → Server: end-session (CHURCH-001)
Server: ❌ Access denied - not session owner

// Admin B can view session (read-only)
Admin B → Server: list-sessions
Server: Returns all sessions with ownership indicators
```

## Security Considerations

### 1. JWT Secret Management

- **Generation**: 256-bit random secret generated on first run
- **Storage**: Stored in `.env` file with restricted permissions (600)
- **Rotation**: Configurable rotation policy (default: 90 days)
- **Backup**: Keep secure backup for disaster recovery

### 2. Password Security

- **Minimum Length**: 8 characters required
- **Storage**: Stored in `.env` file (consider hashing in production)
- **Transmission**: Sent over encrypted WebSocket (WSS)
- **Rate Limiting**: Failed authentication attempts are rate-limited

### 3. Token Security

- **Short-Lived Access Tokens**: Default 1 hour expiry
- **Refresh Token Rotation**: New refresh token issued on each refresh
- **Token Blacklist**: Revoked tokens are blacklisted
- **Expiry Warnings**: Clients notified 5 minutes before expiry

### 4. File Permissions

Ensure proper file permissions for sensitive data:

```bash
chmod 600 .env
chmod 700 admin-identities/
chmod 700 sessions/
```

### 5. Network Security

- **WSS Protocol**: Use encrypted WebSocket connections in production
- **CORS**: Configure appropriate CORS policies
- **Rate Limiting**: Enabled for authentication attempts
- **Connection Limits**: Configurable max connections per admin

## Troubleshooting

### Admin Cannot Login

**Symptoms**: Authentication fails with invalid credentials

**Solutions**:
1. Verify credentials in `.env` file
2. Check JWT secret is generated
3. Review server logs for authentication errors
4. Ensure admin identities directory exists and is writable

```bash
# Check configuration
cat src/websocket-server/.env | grep ADMIN

# Verify directories
ls -la src/websocket-server/admin-identities/
ls -la src/websocket-server/sessions/

# Re-run setup if needed
cd src/websocket-server
./setup-admin.sh
```

### Token Expired Errors

**Symptoms**: Client receives "token expired" errors

**Solutions**:
1. Client should automatically refresh token
2. Check token expiry configuration
3. Verify system clocks are synchronized
4. Review refresh token validity

```bash
# Check token configuration
cat src/websocket-server/.env | grep JWT

# Adjust expiry times if needed
JWT_ACCESS_TOKEN_EXPIRY=2h  # Increase if needed
JWT_REFRESH_TOKEN_EXPIRY=60d  # Increase if needed
```

### Session Ownership Issues

**Symptoms**: Admin cannot manage their own sessions

**Solutions**:
1. Check admin identity persistence
2. Verify session files have correct adminId
3. Run migration script if upgrading from old format
4. Review session ownership in admin identity file

```bash
# Check admin identity
cat src/websocket-server/admin-identities/{adminId}.json

# Check session file
cat src/websocket-server/sessions/{sessionId}.json

# Run migration if needed
cd src/websocket-server
./migrate-admin-sessions.sh
```

### Multiple Connection Issues

**Symptoms**: Admin connections conflict or disconnect each other

**Solutions**:
1. Verify concurrent connection support is enabled
2. Check socket ID tracking in AdminIdentityManager
3. Review connection logs for conflicts
4. Ensure proper cleanup on disconnect

### File Persistence Errors

**Symptoms**: Admin identities or sessions not persisting

**Solutions**:
1. Check directory permissions (should be 700)
2. Verify disk space availability
3. Review file locking errors in logs
4. Check for corrupted JSON files

```bash
# Fix permissions
chmod 700 src/websocket-server/admin-identities/
chmod 700 src/websocket-server/sessions/

# Check disk space
df -h

# Validate JSON files
for file in src/websocket-server/admin-identities/*.json; do
  echo "Checking $file"
  node -e "JSON.parse(require('fs').readFileSync('$file', 'utf8'))"
done
```

## API Reference

### Admin Authentication Messages

#### admin-auth (Request)
```typescript
{
  type: 'admin-auth',
  method: 'credentials' | 'token',
  username?: string,      // Required for credentials method
  password?: string,      // Required for credentials method
  token?: string,         // Required for token method
  clientInfo?: {
    appVersion: string,
    platform: string,
    deviceId: string
  }
}
```

#### admin-auth-response (Response)
```typescript
{
  type: 'admin-auth-response',
  success: boolean,
  adminId?: string,
  username?: string,
  token?: string,
  tokenExpiry?: string,
  refreshToken?: string,
  ownedSessions?: SessionSummary[],
  allSessions?: SessionSummary[],
  permissions?: AdminPermissions,
  error?: string
}
```

### Token Management Messages

#### token-refresh (Request)
```typescript
{
  type: 'token-refresh',
  refreshToken: string,
  adminId: string
}
```

#### token-refresh-response (Response)
```typescript
{
  type: 'token-refresh-response',
  success: boolean,
  token?: string,
  tokenExpiry?: string,
  refreshToken?: string,
  error?: string
}
```

#### token-expiry-warning (Server → Client)
```typescript
{
  type: 'token-expiry-warning',
  adminId: string,
  expiresAt: string,
  timeRemaining: number  // seconds
}
```

### Session Management Messages

#### start-session (Request)
```typescript
{
  type: 'start-session',
  sessionId: string,
  config: SessionConfig
}
```

#### end-session (Request)
```typescript
{
  type: 'end-session',
  sessionId: string,
  reason?: string
}
```

#### list-sessions (Request)
```typescript
{
  type: 'list-sessions',
  filter?: 'owned' | 'all'
}
```

### Error Codes

Common admin error codes:

- `AUTH_1001`: Invalid credentials
- `AUTH_1002`: Token expired
- `AUTH_1003`: Token invalid
- `AUTH_1007`: Rate limited
- `AUTHZ_1102`: Session not owned
- `SESSION_1201`: Session not found
- `SYSTEM_1401`: Internal server error

See `src/websocket-server/MESSAGE_PROTOCOLS.md` for complete error code reference.

## Best Practices

### For Administrators

1. **Secure Credentials**: Use strong passwords (12+ characters)
2. **Regular Backups**: Backup `.env` and admin identities directory
3. **Monitor Logs**: Review authentication and session logs regularly
4. **Update Tokens**: Allow automatic token refresh in client
5. **Clean Sessions**: End sessions when no longer needed

### For Developers

1. **Error Handling**: Implement comprehensive error handling for auth failures
2. **Token Refresh**: Implement automatic token refresh before expiry
3. **Reconnection Logic**: Handle reconnection with token-based auth
4. **Session Recovery**: Restore session list on reconnection
5. **Security Audits**: Regular security reviews of authentication flow

### For Deployment

1. **Environment Security**: Restrict `.env` file permissions
2. **HTTPS/WSS**: Use encrypted connections in production
3. **Monitoring**: Set up monitoring for authentication failures
4. **Backup Strategy**: Regular backups of admin identities and sessions
5. **Disaster Recovery**: Document recovery procedures

## Additional Resources

- [WebSocket Server README](src/websocket-server/README.md) - Server architecture and implementation
- [Message Protocols](src/websocket-server/MESSAGE_PROTOCOLS.md) - Complete message protocol reference
- [Security Implementation](src/websocket-server/SECURITY_IMPLEMENTATION.md) - Security details
- [Implementation Summary](IMPLEMENTATION_SUMMARY.md) - Overall system implementation status

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review server logs in `src/websocket-server/logs/`
3. Check migration logs if upgrading
4. Review error codes in MESSAGE_PROTOCOLS.md
