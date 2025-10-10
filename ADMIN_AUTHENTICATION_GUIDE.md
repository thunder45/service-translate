# Admin Authentication System Guide

**Service Translate - Unified Cognito Authentication**

## Overview

The Admin Authentication System provides unified authentication using AWS Cognito as the single source of truth for admin identities. This eliminates the previous dual-authentication system and provides a streamlined, secure authentication experience for both AWS services and WebSocket server operations.

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

### Unified Authentication Model

```
┌─────────────────────────────────────────────────────────┐
│                  Capture Electron App                    │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Unified Cognito Authentication                  │  │
│  │  - Single credential set                         │  │
│  │  - AWS services + WebSocket operations          │  │
│  │  - Encrypted token storage                       │  │
│  │  - Automatic token refresh                       │  │
│  └──────────────────┬───────────────────────────────┘  │
└─────────────────────┼──────────────────────────────────┘
                      │
                      │ Cognito Tokens
                      │
         ┌────────────┴────────────┐
         │                         │
         ▼                         ▼
  ┌─────────────┐          ┌─────────────┐
  │ AWS Cognito │          │ WebSocket   │
  │ User Pool   │          │ Server      │
  │             │          │ (validates  │
  │             │          │  Cognito)   │
  └─────────────┘          └─────────────┘
```

### Components

**1. AWS Cognito User Pool**
- Centralized user management
- Password policies and MFA support
- Token generation and validation
- Account recovery and security

**2. Cognito Authentication Service** (`cognito-auth.ts`)
- Validates Cognito credentials
- Authenticates using USER_PASSWORD_AUTH flow
- Refreshes access tokens
- Extracts user information from tokens

**3. AdminIdentityManager** (`admin-identity-manager.ts`)
- Manages admin connections
- Tracks session ownership
- Handles token validation
- Supports multiple connections per admin

**4. Secure Token Storage** (`secure-token-storage.ts`)
- Encrypts tokens using Electron safeStorage
- Persists tokens across app restarts
- Automatic cleanup on logout

### Data Flow

1. **Initial Authentication:**
   - Admin enters Cognito credentials in Capture app
   - Credentials sent to WebSocket server
   - Server validates against Cognito User Pool
   - Cognito returns access, ID, and refresh tokens
   - Tokens stored encrypted on client
   - Admin gains access to both AWS services and sessions

2. **Token-Based Reconnection:**
   - Client reconnects with stored Cognito access token
   - Server validates token against Cognito
   - Server retrieves admin identity by Cognito sub
   - Admin regains control of owned sessions

3. **Automatic Token Refresh:**
   - Client checks token expiry every 5 minutes
   - If less than 10 minutes remaining, automatically refresh
   - Use Cognito refresh token to get new access token
   - Update stored tokens
   - Continue operations without interruption

## Key Features

### 1. Single Authentication Source

All admin operations use Cognito credentials:

```typescript
interface CognitoUserInfo {
  sub: string;           // Cognito user ID (UUID) - persistent identifier
  email: string;         // User email
  username: string;      // Username
  'cognito:groups'?: string[]; // User groups (for future RBAC)
}
```

### 2. Persistent Admin Identity

Admin identities are based on Cognito sub (UUID):

```typescript
interface AdminIdentity {
  adminId: string;           // Cognito sub (UUID)
  cognitoUsername: string;   // Cognito username
  email: string;             // Cognito email
  createdAt: Date;
  lastSeen: Date;
  activeSockets: Set<string>; // Current connections
  ownedSessions: Set<string>; // Sessions created by admin
  cognitoGroups?: string[];  // Cognito groups for future RBAC
}
```

### 3. Cognito Token Management

- **Access Tokens**: Short-lived (default: 1 hour) for API operations
- **ID Tokens**: Contains user information
- **Refresh Tokens**: Long-lived (default: 30 days) for obtaining new access tokens
- **Automatic Refresh**: Client refreshes tokens proactively
- **Expiry Warnings**: Not needed - client handles refresh automatically

### 4. Session Ownership

Sessions are permanently linked to the Cognito sub of the admin who created them:

```typescript
interface SessionData {
  sessionId: string;
  adminId: string;                    // Cognito sub (UUID)
  currentAdminSocketId: string | null; // Current connection
  createdBy: string;                  // Cognito username for display
  // ... other fields
}
```

### 5. Multi-Admin Support

- Multiple admins can connect simultaneously
- Each admin can only manage their own sessions
- All admins can view all sessions (read-only for others' sessions)
- Multiple connections from same admin are supported

### 6. Encrypted Token Storage

Tokens are stored securely on the client:

```typescript
class SecureTokenStorage {
  // Store tokens encrypted using Electron safeStorage
  storeTokens(tokens: {
    accessToken: string;
    idToken: string;
    refreshToken: string;
    expiresAt: Date;
  }): void;
  
  // Load and decrypt stored tokens
  loadTokens(): TokenData | null;
  
  // Clear stored tokens
  clearTokens(): void;
}
```

## Setup and Configuration

### 1. Deploy AWS Cognito Stack

```bash
cd src/backend
npm install
cdk bootstrap  # First time only
npm run deploy
```

Note the following from CDK output:
- Cognito User Pool ID (e.g., `us-east-1_xxxxxx`)
- Cognito Client ID (e.g., `xxxxxxxxxxxxxxxxxxxxxxxxxx`)
- AWS Region (e.g., `us-east-1`)

### 2. Run Unified Setup Script

```bash
cd src/websocket-server
./setup-unified-auth.sh
```

The script will:
- Parse Cognito configuration from CDK output
- Validate Cognito stack deployment
- Generate `.env` file with Cognito values
- Create admin identities directory
- Create sessions directory
- Optionally create a Cognito user

### 3. Environment Configuration

Key environment variables in `.env`:

```bash
# Cognito Configuration (REQUIRED)
COGNITO_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_xxxxxx
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx

# Admin Identity Persistence
ADMIN_IDENTITIES_DIR=./admin-identities
ADMIN_IDENTITY_CLEANUP_ENABLED=true
ADMIN_IDENTITY_RETENTION_DAYS=90

# Session Configuration
SESSION_PERSISTENCE_DIR=./sessions
SESSION_TIMEOUT_MINUTES=480
SESSION_CLEANUP_ENABLED=true
```

### 4. Cognito User Pool Client Configuration

The Cognito User Pool Client must be configured with:

- **Client Type**: Public client (no secret)
- **Auth Flows**: 
  - ALLOW_USER_PASSWORD_AUTH (enabled)
  - ALLOW_REFRESH_TOKEN_AUTH (enabled)
- **Token Expiry**:
  - Access Token: 1 hour (default)
  - ID Token: 1 hour (default)
  - Refresh Token: 30 days (default)
- **Read/Write Attributes**: email, preferred_username (minimum)

### 5. Create Cognito Users

Create admin users in Cognito User Pool:

```bash
# Using AWS CLI
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_xxxxxx \
  --username admin@example.com \
  --user-attributes Name=email,Value=admin@example.com \
  --temporary-password TempPassword123!

# Or use the setup script
./setup-unified-auth.sh
# Choose "Yes" when prompted to create a user
```

**Note**: All users in the Cognito User Pool have admin access to the WebSocket server.

## Admin Authentication Flow

### Credential-Based Authentication

```typescript
// Client sends authentication request
{
  type: 'admin-auth',
  method: 'credentials',
  username: 'admin@example.com',
  password: 'your-password',
  clientInfo: {
    appVersion: '2.0.0',
    platform: 'darwin',
    deviceId: 'unique-device-id'
  }
}

// Server validates against Cognito and responds
{
  type: 'admin-auth-response',
  success: true,
  adminId: 'cognito-sub-uuid',
  username: 'admin@example.com',
  accessToken: 'cognito-access-token',
  idToken: 'cognito-id-token',
  refreshToken: 'cognito-refresh-token',
  expiresIn: 3600,  // seconds
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
// Client reconnects with stored Cognito token
{
  type: 'admin-auth',
  method: 'token',
  accessToken: 'stored-cognito-access-token'
}

// Server validates token against Cognito and responds
{
  type: 'admin-auth-response',
  success: true,
  adminId: 'cognito-sub-uuid',
  username: 'admin@example.com',
  ownedSessions: [...],
  allSessions: [...]
}
```

### Token Refresh

```typescript
// Client requests token refresh
{
  type: 'token-refresh',
  refreshToken: 'stored-cognito-refresh-token'
}

// Server uses Cognito to refresh and responds
{
  type: 'token-refresh-response',
  success: true,
  accessToken: 'new-cognito-access-token',
  expiresIn: 3600
}
```

### Automatic Token Refresh (Client-Side)

The Capture app automatically manages token refresh:

```typescript
// Check token expiry every 5 minutes
setInterval(() => {
  const tokens = secureTokenStorage.loadTokens();
  if (!tokens) return;
  
  const timeRemaining = tokens.expiresAt.getTime() - Date.now();
  const tenMinutes = 10 * 60 * 1000;
  
  // Refresh if less than 10 minutes remaining
  if (timeRemaining < tenMinutes) {
    refreshCognitoTokens();
  }
}, 5 * 60 * 1000);
```

## Session Management

### Creating a Session

```typescript
// Admin creates session (requires Cognito authentication)
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

// Server creates session linked to Cognito sub
{
  type: 'start-session-response',
  success: true,
  sessionId: 'CHURCH-2025-001',
  adminId: 'cognito-sub-uuid',
  config: {...}
}
```

### Session Ownership Verification

The server automatically verifies admin ownership for all session operations:

- **Create Session**: Automatically linked to authenticated admin's Cognito sub
- **End Session**: Only owner (by Cognito sub) can end their sessions
- **Update Config**: Only owner can modify session configuration
- **View Session**: All admins can view, only owner can modify

### Multi-Admin Scenarios

```typescript
// Admin A creates session
Admin A (Cognito sub: abc-123) → Server: start-session (CHURCH-001)
Server: Links session to Cognito sub abc-123

// Admin B tries to end Admin A's session
Admin B (Cognito sub: def-456) → Server: end-session (CHURCH-001)
Server: ❌ Access denied - Cognito sub doesn't match session owner

// Admin B can view session (read-only)
Admin B → Server: list-sessions
Server: Returns all sessions with ownership indicators
```

## Security Considerations

### 1. Cognito Security Benefits

- **Centralized Security**: Cognito handles password policies, MFA, account recovery
- **Token Management**: Cognito manages token lifecycle, rotation, revocation
- **Audit Trail**: Cognito provides authentication logs and monitoring
- **Scalability**: Cognito scales automatically with user base
- **Compliance**: Cognito is SOC 2, ISO 27001, HIPAA compliant

### 2. Token Security

- **Short-Lived Access Tokens**: Default 1 hour expiry
- **Refresh Token Rotation**: New refresh token issued on each refresh
- **Encrypted Storage**: Tokens encrypted using Electron safeStorage
- **Automatic Cleanup**: Tokens cleared on logout
- **No Server Persistence**: Server stores tokens in memory only

### 3. Network Security

- **WSS Protocol**: Use encrypted WebSocket connections in production
- **Server-Side Validation**: All tokens validated against Cognito
- **Rate Limiting**: Authentication attempts are rate-limited
- **Connection Limits**: Configurable max connections per admin

### 4. File Permissions

Ensure proper file permissions for sensitive data:

```bash
chmod 600 .env
chmod 700 admin-identities/
chmod 700 sessions/
```

### 5. Cognito User Pool Security

- **Password Policy**: Configure strong password requirements
- **MFA**: Enable multi-factor authentication for admin accounts
- **Account Recovery**: Configure email/SMS recovery
- **User Pool Monitoring**: Enable CloudWatch logging

## Troubleshooting

### Admin Cannot Login

**Symptoms**: Authentication fails with invalid credentials

**Solutions**:
1. Verify Cognito user exists in User Pool
2. Check username and password are correct
3. Verify User Pool Client configuration (public client, USER_PASSWORD_AUTH enabled)
4. Check server logs for Cognito errors
5. Verify Cognito configuration in `.env`

```bash
# Check Cognito configuration
cat src/websocket-server/.env | grep COGNITO

# Verify Cognito user exists
aws cognito-idp admin-get-user \
  --user-pool-id us-east-1_xxxxxx \
  --username admin@example.com

# Check User Pool Client configuration
aws cognito-idp describe-user-pool-client \
  --user-pool-id us-east-1_xxxxxx \
  --client-id xxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Token Expired Errors

**Symptoms**: Client receives "token expired" errors

**Solutions**:
1. Client should automatically refresh token
2. Check token expiry configuration in Cognito
3. Verify system clocks are synchronized
4. Review refresh token validity

```bash
# Check Cognito token configuration
aws cognito-idp describe-user-pool \
  --user-pool-id us-east-1_xxxxxx \
  --query 'UserPool.Policies.PasswordPolicy'
```

### Session Ownership Issues

**Symptoms**: Admin cannot manage their own sessions

**Solutions**:
1. Check admin identity uses Cognito sub
2. Verify session files have correct adminId (Cognito sub)
3. Review session ownership in admin identity file
4. Ensure Cognito sub is consistent

```bash
# Check admin identity
cat src/websocket-server/admin-identities/{cognito-sub}.json

# Check session file
cat src/websocket-server/sessions/{sessionId}.json

# Verify adminId matches Cognito sub
```

### Cognito Connection Issues

**Symptoms**: Server cannot connect to Cognito

**Solutions**:
1. Verify Cognito User Pool ID is correct
2. Check AWS region is correct
3. Verify network connectivity to Cognito
4. Check Cognito User Pool exists and is active

```bash
# Test Cognito connectivity
aws cognito-idp describe-user-pool \
  --user-pool-id us-east-1_xxxxxx \
  --region us-east-1
```

### Token Storage Issues

**Symptoms**: Tokens not persisting across app restarts

**Solutions**:
1. Check Capture app has write permissions to app data directory
2. Verify Electron safeStorage is available
3. Check for file system errors in logs
4. Ensure app data directory exists

```bash
# Check app data directory (macOS)
ls -la ~/Library/Application\ Support/service-translate-capture/

# Check app data directory (Windows)
dir %APPDATA%\service-translate-capture\
```

## API Reference

### Admin Authentication Messages

#### admin-auth (Request - Credentials)
```typescript
{
  type: 'admin-auth',
  method: 'credentials',
  username: string,      // Cognito username or email
  password: string,      // Cognito password
  clientInfo?: {
    appVersion: string,
    platform: string,
    deviceId: string
  }
}
```

#### admin-auth (Request - Token)
```typescript
{
  type: 'admin-auth',
  method: 'token',
  accessToken: string,   // Cognito access token
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
  adminId?: string,           // Cognito sub (UUID)
  username?: string,          // Cognito username
  accessToken?: string,       // Cognito access token
  idToken?: string,           // Cognito ID token
  refreshToken?: string,      // Cognito refresh token
  expiresIn?: number,         // Token expiry in seconds
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
  refreshToken: string   // Cognito refresh token
}
```

#### token-refresh-response (Response)
```typescript
{
  type: 'token-refresh-response',
  success: boolean,
  accessToken?: string,  // New Cognito access token
  expiresIn?: number,    // Token expiry in seconds
  error?: string
}
```

### Error Codes

Common Cognito error codes:

- `COGNITO_1001`: Invalid credentials
- `COGNITO_1002`: Token expired
- `COGNITO_1003`: Token invalid
- `COGNITO_1004`: User not found
- `COGNITO_1005`: User disabled
- `COGNITO_1006`: Cognito unavailable
- `COGNITO_1007`: Refresh token expired
- `COGNITO_1008`: Insufficient permissions

See `src/websocket-server/MESSAGE_PROTOCOLS.md` for complete error code reference.

## Best Practices

### For Administrators

1. **Secure Credentials**: Use strong passwords (12+ characters)
2. **Enable MFA**: Enable multi-factor authentication in Cognito
3. **Regular Backups**: Backup admin identities and sessions directories
4. **Monitor Logs**: Review authentication and session logs regularly
5. **Update Tokens**: Allow automatic token refresh in client

### For Developers

1. **Error Handling**: Implement comprehensive error handling for Cognito failures
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

## Migration from v1.x

See [CHANGELOG.md](CHANGELOG.md) for detailed migration instructions from the previous JWT-based authentication system to Cognito-based authentication.

## Additional Resources

- [WebSocket Server README](src/websocket-server/README.md) - Server architecture and implementation
- [Message Protocols](src/websocket-server/MESSAGE_PROTOCOLS.md) - Complete message protocol reference
- [Security Implementation](src/websocket-server/SECURITY_IMPLEMENTATION.md) - Security details
- [Cognito Setup Guide](src/websocket-server/COGNITO_SETUP.md) - Cognito configuration details
- [CHANGELOG.md](CHANGELOG.md) - Version history and breaking changes

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review server logs in `src/websocket-server/logs/`
3. Check Cognito User Pool configuration
4. Review error codes in MESSAGE_PROTOCOLS.md
5. Verify Cognito connectivity and configuration

