# TTS Server (WebSocket Server)

Real-time translation broadcasting server with optional AWS Polly TTS generation.

## Features

- **WebSocket Communication**: Socket.IO for real-time bidirectional messaging
- **Session Management**: Create and manage translation sessions
- **AWS Polly TTS**: Optional server-side text-to-speech generation
- **Audio Serving**: HTTP endpoints for audio file delivery
- **Security**: Rate limiting, authentication, and session validation
- **Monitoring**: Comprehensive logging and health checks

## Architecture

```
Capture App → TTS Server → PWA Clients
                  ↓
            AWS Polly (optional)
                  ↓
            Audio Cache
```

### Error Handling System

The server implements a comprehensive error handling system for admin operations:

```
Admin Operation → Error Middleware → AdminErrorManager → Error Logger
                        ↓                    ↓
                  Validation          Error Code Mapping
                  Rate Limiting       Security Event Logging
                  Error Response      Audit Trail
```

**Key Components:**
- **AdminErrorManager**: Manages error codes, user-friendly messages, and audit trail
- **AdminErrorMiddleware**: Wraps operations with error handling and retry logic
- **Error Code System**: Structured error codes (AUTH_*, AUTHZ_*, SESSION_*, etc.)
- **Security Event Logging**: Tracks authentication failures and authorization violations
- **Retry Strategy**: Classifies errors as retryable with appropriate delays

### Admin Identity System

The server implements persistent admin authentication to maintain session ownership across reconnections:

```
Admin Authentication → Admin Identity Manager → Admin Identity Store → Session Manager
                              ↓                          ↓
                       JWT Token Management    File-based Persistence
                                                (./admin-identities/)
```

**Key Components:**
- **AdminIdentityManager**: Orchestrates admin authentication, session recovery, and token management
- **AdminIdentityStore**: Manages persistent admin identities with file-based storage
- **Admin Identity**: Persistent UUID-based identifier for admin users
- **Session Ownership**: Sessions are linked to admin identities, not socket connections
- **JWT Tokens**: Secure token-based authentication with automatic refresh
- **Lifecycle Management**: Automatic cleanup of inactive admins and expired tokens

#### AdminIdentityManager

The `AdminIdentityManager` class is the central component for admin authentication and session management.

**Core Responsibilities:**
1. **Admin Registration**: Register new admin connections with credentials or JWT tokens
2. **Session Ownership**: Verify and track which sessions belong to which admins
3. **Token Management**: Generate, validate, and refresh JWT access and refresh tokens
4. **Session Recovery**: Restore admin's owned sessions after reconnection
5. **Concurrent Connections**: Handle multiple simultaneous connections from the same admin

**Authentication Flow:**

```typescript
// Credential-based authentication
const identity = adminManager.registerAdminConnection(username, socketId);
const tokens = adminManager.generateTokenPair(identity.adminId);

// Token-based authentication (reconnection)
const identity = adminManager.registerAdminConnectionWithToken(token, socketId);
const sessionIds = adminManager.recoverAdminSessions(identity.adminId);
```

**Session Ownership Verification:**

```typescript
// Check if admin owns a session
const isOwner = adminManager.verifySessionOwnership(adminId, sessionId);

// Get all sessions owned by admin
const sessionIds = adminManager.getAdminSessionIds(adminId);

// Add session to admin's owned sessions
adminManager.addOwnedSession(adminId, sessionId);
```

**Token Management:**

```typescript
// Generate token pair (access + refresh)
const tokens = adminManager.generateTokenPair(adminId);
// Returns: { accessToken, refreshToken, accessTokenExpiry, refreshTokenExpiry }

// Validate access token
const payload = adminManager.validateAccessToken(token);

// Refresh tokens using refresh token
const newTokens = adminManager.refreshTokens(refreshToken);

// Check token status
const status = adminManager.checkTokenStatus(token);
// Returns: { isValid, isExpired, needsRefresh, timeRemaining }

// Schedule expiry warning (5 minutes before expiry)
adminManager.scheduleExpiryWarning(adminId, tokenExpiry, (adminId, expiresAt, timeRemaining) => {
  // Send warning to admin
  sendTokenExpiryWarning(adminId, expiresAt, timeRemaining);
});
```

**Session Recovery on Reconnection:**

```typescript
// Recover admin's sessions after reconnection
const sessionIds = adminManager.recoverAdminSessions(adminId);

// Update admin socket ID for all owned sessions
adminManager.updateSessionAdminSocket(adminId, newSocketId, (sessionId, socketId) => {
  sessionManager.updateCurrentAdminSocket(sessionId, socketId);
});
```

**Concurrent Connection Handling:**

```typescript
// Handle multiple connections from same admin
const result = adminManager.handleConcurrentConnection(adminId, newSocketId);
// Returns: { isNewConnection, existingSocketCount, existingSockets }

// Notify all admin connections about a change
adminManager.notifyAdminConnections(adminId, (socketId) => {
  io.to(socketId).emit('session-status-update', data);
});
```

**Security Considerations:**

1. **JWT Secret Management**:
   - Secret is generated on first run and stored in `.env`
   - Use strong, randomly generated secrets (256-bit minimum)
   - Rotate secrets periodically (recommended: every 90 days)
   - Never commit secrets to version control

2. **Token Expiry**:
   - Access tokens: Short-lived (default: 1 hour)
   - Refresh tokens: Long-lived (default: 30 days)
   - Tokens are invalidated on logout or security events

3. **Token Validation**:
   - All admin operations require valid access token
   - Token version checking prevents use of invalidated tokens
   - Refresh tokens are single-use and rotated on refresh

4. **Session Ownership**:
   - Strict verification before any session modification
   - Read-only access allowed for non-owned sessions
   - Audit logging for all admin operations

**Configuration:**

```typescript
const jwtConfig: JWTConfig = {
  secret: process.env.JWT_SECRET || 'generated-secret',
  algorithm: 'HS256',
  issuer: 'service-translate-ws',
  audience: 'service-translate-admin',
  accessTokenExpiry: '1h',
  refreshTokenExpiry: '30d'
};

const adminManager = new AdminIdentityManager(adminStore, jwtConfig);
```

**Admin Session Recovery Workflow:**

1. **Initial Connection**:
   ```
   Admin connects → Authenticate with credentials → Generate tokens → Return owned sessions
   ```

2. **Reconnection**:
   ```
   Admin reconnects → Authenticate with token → Recover admin identity → Return owned sessions → Update session socket IDs
   ```

3. **Token Refresh**:
   ```
   Token expiring → Client requests refresh → Validate refresh token → Generate new token pair → Return new tokens
   ```

4. **Session Expiry**:
   ```
   Token expired → Send expiry notification → Client re-authenticates → Recover sessions
   ```

**Troubleshooting:**

- **Token Expired**: Client should use refresh token to get new access token
- **Invalid Token**: Client must re-authenticate with credentials
- **Session Not Found**: Session may have been deleted or expired
- **Access Denied**: Admin does not own the session (read-only access available)
- **Concurrent Connection Limit**: Configure max connections per admin if needed

### WebSocket Connection Lifecycle with Admin Authentication

The WebSocket server supports two types of connections: admin connections (from Capture app) and client connections (from PWA). Admin connections require authentication and maintain persistent identity across reconnections.

#### Initial Admin Connection (Credential-Based)

```
1. Client connects to WebSocket server
   ↓
2. Server accepts connection and assigns socket ID
   ↓
3. Client sends 'admin-auth' message with credentials
   {
     type: 'admin-auth',
     method: 'credentials',
     username: 'admin',
     password: '***'
   }
   ↓
4. Server validates credentials via AuthManager
   ↓
5. Server creates/retrieves admin identity via AdminIdentityManager
   ↓
6. Server generates JWT token pair (access + refresh)
   ↓
7. Server schedules token expiry warning (5 min before expiry)
   ↓
8. Server sends authentication response
   {
     type: 'admin-auth-response',
     success: true,
     adminId: 'uuid',
     username: 'admin',
     token: 'jwt-access-token',
     refreshToken: 'jwt-refresh-token',
     tokenExpiry: '2025-10-09T15:00:00Z',
     ownedSessions: [...],  // Sessions owned by this admin
     allSessions: [...],    // All active sessions
     permissions: {...}
   }
   ↓
9. Client stores tokens for future use
   ↓
10. Admin can now perform session operations
```

#### Admin Reconnection (Token-Based)

```
1. Client connects to WebSocket server with token in auth header
   Authorization: Bearer <jwt-access-token>
   ↓
2. Server validates token and extracts admin identity
   ↓
3. Server registers admin connection with existing identity
   ↓
4. Server recovers admin's owned sessions
   ↓
5. Server updates currentAdminSocketId for all owned sessions
   ↓
6. Server sends connection confirmation
   {
     message: 'Connected to Service Translate WebSocket Server',
     socketId: 'socket-xyz',
     isAdmin: true,
     adminId: 'uuid',
     username: 'admin'
   }
   ↓
7. Server sends admin reconnection notification
   {
     type: 'admin-reconnection',
     adminId: 'uuid',
     username: 'admin',
     recoveredSessions: ['SESSION-001', 'SESSION-002']
   }
   ↓
8. Admin regains control of all owned sessions
```

#### Token Refresh Flow

```
1. Server sends token expiry warning (5 minutes before expiry)
   {
     type: 'token-expiry-warning',
     adminId: 'uuid',
     expiresAt: '2025-10-09T15:00:00Z',
     timeRemaining: 300  // seconds
   }
   ↓
2. Client sends token refresh request
   {
     type: 'token-refresh',
     refreshToken: 'jwt-refresh-token',
     adminId: 'uuid'
   }
   ↓
3. Server validates refresh token
   ↓
4. Server generates new token pair
   ↓
5. Server removes old refresh token
   ↓
6. Server sends new tokens
   {
     type: 'token-refresh-response',
     success: true,
     token: 'new-jwt-access-token',
     refreshToken: 'new-jwt-refresh-token',
     tokenExpiry: '2025-10-09T16:00:00Z'
   }
   ↓
7. Client stores new tokens
   ↓
8. Connection continues without interruption
```

#### Session Expiry Flow

```
1. Token expires without refresh
   ↓
2. Server detects expired token on next operation
   ↓
3. Server sends session expired notification
   {
     type: 'session-expired',
     adminId: 'uuid',
     reason: 'token-expired'
   }
   ↓
4. Client prompts user for credentials
   ↓
5. Client re-authenticates with credentials
   ↓
6. Server generates new tokens
   ↓
7. Admin sessions are recovered
   ↓
8. Connection restored with full access
```

#### Admin Disconnection

```
1. Client disconnects (network issue, app close, etc.)
   ↓
2. Server detects disconnection
   ↓
3. Server retrieves admin identity by socket ID
   ↓
4. Server removes socket from admin's active connections
   ↓
5. Server clears token expiry warning timer
   ↓
6. Server checks if admin has other active connections
   ↓
7. If no other connections:
   - Admin identity remains in store
   - Owned sessions remain active
   - Sessions can be recovered on reconnection
   ↓
8. If other connections exist:
   - Other connections continue to manage sessions
   - No interruption to session operations
```

#### Concurrent Connection Handling

```
1. Admin connects from multiple devices/tabs
   ↓
2. Each connection authenticates independently
   ↓
3. Server tracks all socket IDs for the admin
   ↓
4. All connections can manage admin's owned sessions
   ↓
5. Session updates broadcast to all admin connections
   ↓
6. Disconnection of one connection doesn't affect others
   ↓
7. Sessions remain accessible until all connections close
```

#### Connection Security

**Authentication Requirements:**
- Admin connections MUST authenticate before session operations
- Token-based auth allows seamless reconnection
- Credential-based auth required for initial connection or expired tokens

**Token Security:**
- Access tokens: Short-lived (1 hour default)
- Refresh tokens: Long-lived (30 days default)
- Tokens stored securely on client
- Token rotation on refresh

**Rate Limiting:**
- Authentication attempts: Limited to prevent brute force
- Token refresh: Limited to prevent abuse
- Session operations: Per-admin rate limits

**Connection Validation:**
- Socket ID tracked for each connection
- Admin identity verified on every operation
- Session ownership checked before modifications
- Read-only access for non-owned sessions

### Deployment Guide for Admin Authentication Configuration

This guide covers deploying the WebSocket server with admin authentication in production environments.

#### Prerequisites

1. **Node.js**: Version 16 or higher
2. **npm**: Version 8 or higher
3. **File System**: Write access for admin identity storage
4. **Network**: Open port for WebSocket connections (default: 3001)

#### Initial Setup

**1. Install Dependencies**

```bash
cd src/websocket-server
npm install
```

**2. Configure Environment Variables**

Create `.env` file with admin authentication settings:

```bash
# Server Configuration
PORT=3001
NODE_ENV=production

# Admin Authentication
ENABLE_AUTH=true
AUTH_USERNAME=admin
AUTH_PASSWORD=your-secure-password-here

# JWT Configuration
JWT_ACCESS_TOKEN_EXPIRY=1h
JWT_REFRESH_TOKEN_EXPIRY=30d

# Security
WEBSOCKET_RATE_LIMIT_PER_SECOND=10
MAX_CLIENTS_PER_SESSION=50
SESSION_TIMEOUT_MINUTES=480

# TTS (Optional)
ENABLE_TTS=false
```

**3. Generate JWT Secret**

The server automatically generates a JWT secret on first run:

```bash
npm start
# JWT secret will be created at .jwt-secret
# Backup this file for disaster recovery
```

**Important**: The `.jwt-secret` file is critical for token validation. Back it up securely and never commit it to version control.

**4. Create Admin Identities Directory**

```bash
mkdir -p admin-identities
chmod 700 admin-identities
```

**5. Build and Start**

```bash
npm run build
npm start
```

#### Production Configuration

**Security Hardening:**

1. **Strong Passwords**
   ```bash
   # Generate secure password
   openssl rand -base64 32
   # Use in AUTH_PASSWORD
   ```

2. **File Permissions**
   ```bash
   # Restrict JWT secret
   chmod 600 .jwt-secret
   
   # Restrict admin identities
   chmod 700 admin-identities
   chmod 600 admin-identities/*.json
   ```

3. **Environment Variables**
   ```bash
   # Never commit .env to version control
   echo ".env" >> .gitignore
   echo ".jwt-secret" >> .gitignore
   echo "admin-identities/" >> .gitignore
   ```

4. **Token Expiry**
   ```bash
   # Shorter tokens for high-security environments
   JWT_ACCESS_TOKEN_EXPIRY=15m
   JWT_REFRESH_TOKEN_EXPIRY=7d
   ```

5. **Rate Limiting**
   ```bash
   # Stricter limits for production
   WEBSOCKET_RATE_LIMIT_PER_SECOND=5
   AUTH_RATE_LIMIT_PER_MINUTE=10
   ```

**Process Management:**

Use PM2 for production deployment:

```bash
# Install PM2
npm install -g pm2

# Create ecosystem file
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'websocket-server',
    script: './dist/server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/error.log',
    out_file: './logs/output.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};
EOF

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
pm2 startup
```

**Firewall Configuration:**

```bash
# Allow WebSocket port
sudo ufw allow 3001/tcp

# Allow only from specific IPs (recommended)
sudo ufw allow from 192.168.1.0/24 to any port 3001
```

**Reverse Proxy (Nginx):**

```nginx
# /etc/nginx/sites-available/websocket-server
upstream websocket_backend {
    server localhost:3001;
}

server {
    listen 443 ssl http2;
    server_name ws.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://websocket_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket timeout
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
```

#### Monitoring and Maintenance

**Health Checks:**

```bash
# Check server health
curl http://localhost:3001/health

# Check security statistics
curl http://localhost:3001/security

# View logs
tail -f logs/websocket-server-$(date +%Y-%m-%d).log
```

**Admin Identity Maintenance:**

```bash
# List admin identities
ls -lh admin-identities/

# Check admin index
cat admin-identities/admin-index.json | jq

# View cleanup log
cat admin-identities/cleanup-log.json | jq
```

**Token Management:**

```bash
# Rotate JWT secret (requires admin re-authentication)
# 1. Backup old secret
cp .jwt-secret .jwt-secret.backup

# 2. Generate new secret
openssl rand -hex 32 > .jwt-secret

# 3. Restart server
pm2 restart websocket-server

# 4. All admins must re-authenticate
```

**Backup Strategy:**

```bash
# Create backup script
cat > backup-admin-data.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/backup/websocket-server/$(date +%Y%m%d)"
mkdir -p "$BACKUP_DIR"

# Backup JWT secret
cp .jwt-secret "$BACKUP_DIR/"

# Backup admin identities
cp -r admin-identities "$BACKUP_DIR/"

# Backup sessions
cp -r sessions "$BACKUP_DIR/"

# Backup environment
cp .env "$BACKUP_DIR/"

echo "Backup completed: $BACKUP_DIR"
EOF

chmod +x backup-admin-data.sh

# Schedule daily backups
crontab -e
# Add: 0 2 * * * /path/to/backup-admin-data.sh
```

**Log Rotation:**

```bash
# Create logrotate config
sudo cat > /etc/logrotate.d/websocket-server << 'EOF'
/path/to/websocket-server/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
EOF
```

#### Troubleshooting

**Admin Cannot Authenticate:**
1. Check AUTH_USERNAME and AUTH_PASSWORD in .env
2. Verify ENABLE_AUTH=true
3. Check server logs for authentication errors
4. Verify admin-identities directory permissions

**Token Validation Fails:**
1. Check .jwt-secret file exists and is readable
2. Verify JWT_ACCESS_TOKEN_EXPIRY is valid format
3. Check token hasn't expired
4. Verify token version matches admin identity

**Admin Identity Not Persisting:**
1. Check admin-identities directory exists
2. Verify write permissions on directory
3. Check disk space
4. Review server logs for file write errors

**Sessions Not Recovered:**
1. Verify admin identity exists in store
2. Check session files have correct adminId
3. Verify sessions directory is readable
4. Check session ownership in session files

**Performance Issues:**
1. Check number of admin identities (< 1000 recommended)
2. Monitor disk I/O for file operations
3. Review cleanup logs for long-running operations
4. Consider database backend for large deployments

#### Scaling Considerations

**Single Server Limits:**
- Recommended: < 1000 admin identities
- Recommended: < 100 concurrent admin connections
- Recommended: < 500 active sessions

**Multi-Server Deployment:**

For larger deployments, consider:

1. **Shared Storage**: Use NFS or similar for admin-identities directory
2. **Database Backend**: Replace file-based storage with PostgreSQL/MongoDB
3. **Load Balancer**: Use sticky sessions for WebSocket connections
4. **Redis**: Share session state across servers
5. **Message Queue**: Coordinate admin notifications across servers

**Migration to Database:**

When file-based storage becomes a bottleneck:

```typescript
// Example database adapter interface
interface AdminIdentityStoreAdapter {
  createAdminIdentity(username: string): Promise<AdminIdentity>;
  getAdminIdentity(adminId: string): Promise<AdminIdentity | null>;
  getAdminByUsername(username: string): Promise<AdminIdentity | null>;
  updateLastSeen(adminId: string): Promise<void>;
  // ... other methods
}

// Implement for your database
class PostgresAdminIdentityStore implements AdminIdentityStoreAdapter {
  // Implementation using pg library
}
```

#### Security Checklist

Before deploying to production:

- [ ] Strong AUTH_PASSWORD configured
- [ ] JWT secret generated and backed up
- [ ] File permissions set correctly (600 for secrets, 700 for directories)
- [ ] .env and .jwt-secret in .gitignore
- [ ] ENABLE_AUTH=true in production
- [ ] Rate limiting configured
- [ ] Firewall rules configured
- [ ] SSL/TLS enabled (via reverse proxy)
- [ ] Log rotation configured
- [ ] Backup strategy implemented
- [ ] Monitoring and alerting configured
- [ ] Token expiry times appropriate for security requirements
- [ ] Admin identity cleanup schedule verified

#### Enhanced SessionManager

The `SessionManager` class has been enhanced to support admin identity-based session ownership, replacing the previous socket-based approach.

**Session Ownership Model:**

Sessions are now owned by persistent admin identities rather than socket connections:

```typescript
interface SessionData {
  sessionId: string;
  adminId: string;                    // Persistent admin owner
  currentAdminSocketId: string | null; // Current admin connection
  createdBy: string;                  // Username for display
  config: SessionConfig;
  clients: Map<string, ClientData>;
  createdAt: Date;
  lastActivity: Date;
  status: SessionStatus;
}
```

**Key Changes from Previous Version:**

- **Replaced**: `adminSocketId` → `adminId` + `currentAdminSocketId`
- **Added**: `createdBy` field for displaying admin username
- **Enhanced**: Session persistence includes admin identity
- **Migration**: Automatic migration of old session files on startup

**Creating Sessions:**

```typescript
// Create session with admin identity
const session = sessionManager.createSession(
  sessionId,
  config,
  adminId,        // Persistent admin identifier
  adminSocketId,  // Current socket connection
  createdBy       // Admin username
);
```

**Admin Access Verification:**

```typescript
// Verify admin can perform operation on session
const canRead = sessionManager.verifyAdminAccess(sessionId, adminId, 'read');
const canWrite = sessionManager.verifyAdminAccess(sessionId, adminId, 'write');

// Access rules:
// - Read: All admins can view all sessions
// - Write: Only session owner can modify
```

**Session Queries:**

```typescript
// Get all sessions owned by an admin
const ownedSessions = sessionManager.getSessionsByAdmin(adminId);

// Get session ownership information
const ownership = sessionManager.getSessionOwnership(sessionId);
// Returns: { adminId, createdBy, currentAdminSocketId }

// Get all sessions (for admin dashboard)
const allSessions = sessionManager.getAllSessions();
```

**Reconnection Handling:**

```typescript
// Update current admin socket after reconnection
const updated = sessionManager.updateCurrentAdminSocket(sessionId, newSocketId);

// This preserves session ownership (adminId) while updating the active connection
```

**Session Data Migration:**

The SessionManager automatically migrates old session files on startup:

1. **Detection**: Identifies files with `adminSocketId` field
2. **Migration**: Converts to new format with `adminId` and `currentAdminSocketId`
3. **System Admin**: Assigns orphaned sessions to 'system' admin
4. **Cleanup**: Removes deprecated `adminSocketId` field
5. **Logging**: Reports migration progress and errors

**Migration Process:**

```
Old Format:
{
  "sessionId": "CHURCH-2025-001",
  "adminSocketId": "abc123",  // Deprecated
  ...
}

New Format:
{
  "sessionId": "CHURCH-2025-001",
  "adminId": "system",              // Persistent identifier
  "currentAdminSocketId": null,     // No active connection
  "createdBy": "system",            // Display name
  ...
}
```

**Manual Migration:**

If automatic migration fails, use the migration script:

```bash
cd src/websocket-server
node -e "
const { SessionManager } = require('./dist/session-manager');
const sm = new SessionManager('./sessions');
sm.migrateOldSessionFiles();
"
```

**Session Persistence:**

Sessions are persisted to `./sessions/{sessionId}.json` with the following structure:

```json
{
  "sessionId": "CHURCH-2025-001",
  "adminId": "550e8400-e29b-41d4-a716-446655440000",
  "currentAdminSocketId": "socket-xyz",
  "createdBy": "admin-user",
  "config": {
    "enabledLanguages": ["en", "es", "fr"],
    "ttsMode": "neural",
    "audioQuality": "high"
  },
  "clients": [
    ["client-1", { "socketId": "client-1", "preferredLanguage": "es", ... }]
  ],
  "createdAt": "2025-10-09T10:00:00.000Z",
  "lastActivity": "2025-10-09T10:30:00.000Z",
  "status": "active"
}
```

**Best Practices:**

1. **Always verify access** before modifying sessions:
   ```typescript
   if (!sessionManager.verifyAdminAccess(sessionId, adminId, 'write')) {
     throw new Error('Access denied');
   }
   ```

2. **Use admin identity** for session operations:
   ```typescript
   // Good: Uses persistent admin ID
   const sessions = sessionManager.getSessionsByAdmin(adminId);
   
   // Bad: Don't use socket ID for ownership
   // const sessions = sessionManager.getSessionsBySocket(socketId); // Removed
   ```

3. **Update socket on reconnection**:
   ```typescript
   // When admin reconnects
   sessionManager.updateCurrentAdminSocket(sessionId, newSocketId);
   ```

4. **Handle orphaned sessions**:
   ```typescript
   // Sessions with adminId='system' are orphaned
   const ownership = sessionManager.getSessionOwnership(sessionId);
   if (ownership.adminId === 'system') {
     // Handle orphaned session (e.g., allow any admin to claim)
   }
   ```

**Troubleshooting:**

- **Migration Errors**: Check `./sessions/` directory permissions and file format
- **Access Denied**: Verify admin owns the session using `getSessionOwnership()`
- **Orphaned Sessions**: Sessions with `adminId='system'` need manual reassignment
- **Socket Updates**: Use `updateCurrentAdminSocket()` not `updateAdminSocket()`

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure TTS
```bash
./setup-tts.sh  # Interactive setup
# Or manually: cp .env.example .env && nano .env
```

### 3. Start Server
```bash
npm start
```

## Configuration

### Environment Variables

```bash
# Server
PORT=3001

# TTS (Optional)
ENABLE_TTS=false                    # Set to 'true' to enable AWS Polly
AWS_REGION=us-east-1
AWS_IDENTITY_POOL_ID=               # Cognito Identity Pool ID
AWS_USER_POOL_ID=                   # Cognito User Pool ID
AWS_JWT_TOKEN=                      # JWT token (optional)

# Security
ENABLE_AUTH=false
AUTO_GENERATE_SESSION_IDS=false     # Accept client-provided session IDs
SESSION_TIMEOUT_MINUTES=480

# Rate Limiting
WEBSOCKET_RATE_LIMIT_PER_SECOND=10
POLLY_RATE_LIMIT_PER_MINUTE=60
MAX_CLIENTS_PER_SESSION=50
```

### TTS Modes

#### Disabled (Default)
```bash
ENABLE_TTS=false
```
- Clients receive text-only translations
- Clients can use local Web Speech API TTS
- Zero AWS Polly costs

#### Enabled
```bash
ENABLE_TTS=true
AWS_REGION=us-east-1
AWS_IDENTITY_POOL_ID=us-east-1:xxx
AWS_USER_POOL_ID=us-east-1_xxx
AWS_JWT_TOKEN=eyJxxx...
```
- Server generates audio using AWS Polly
- Clients receive high-quality audio URLs
- Costs apply per character

## API Reference

### WebSocket Events

#### From Capture App

**start-session**
```typescript
{
  sessionId: string;
  config: {
    targetLanguages: string[];
    ttsMode: 'neural' | 'standard' | 'local' | 'disabled';
    audioQuality: 'high' | 'medium' | 'low';
  }
}
```

**broadcast-translation**
```typescript
{
  sessionId: string;
  original: string;
  translations: {
    en: string;
    es: string;
    fr: string;
    de: string;
    it: string;
  };
  generateTTS: boolean;      // Request TTS generation
  voiceType: 'neural' | 'standard';
}
```

#### From PWA Clients

**join-session**
```typescript
{
  sessionId: string;
  language: string;
  clientInfo: {
    userAgent: string;
    audioCapabilities: {
      localTTSLanguages: string[];
    }
  }
}
```

#### To Clients

**translation**
```typescript
{
  type: 'translation';
  sessionId: string;
  original: string;
  text: string;
  language: string;
  timestamp: number;
  audioUrl: string | null;    // null if TTS disabled/failed
  audioMetadata: {
    audioId: string;
    duration: number;
    format: string;
    voiceType: string;
    size: number;
  } | null;
  ttsAvailable: boolean;
}
```

### HTTP Endpoints

**GET /health**
```bash
curl http://localhost:3001/health
```
Returns server health status

**GET /audio/:filename**
```bash
curl http://localhost:3001/audio/abc123.mp3
```
Serves audio files generated by Polly

## Development

### Run in Development Mode
```bash
npm run dev
```

### Run Tests
```bash
npm test
```

### Build
```bash
npm run build
```

## Troubleshooting

### TTS Not Working
1. Check `ENABLE_TTS=true` in .env
2. Verify AWS credentials are correct
3. Check JWT token is valid (not expired)
4. Review server logs for Polly errors

### Clients Not Receiving Audio
1. Verify TTS is enabled on server
2. Check capture app is sending `generateTTS: true`
3. Confirm audio files are being created in `audio-cache/`
4. Test audio URL directly in browser

### Connection Issues
1. Check server is running on correct port
2. Verify firewall allows WebSocket connections
3. Confirm capture app has correct server URL
4. Review CORS settings if needed

## Cost Optimization

### TTS Costs
- **Neural voices**: $16 per 1M characters
- **Standard voices**: $4 per 1M characters
- **Typical service**: ~225K characters = $0.90-$3.60

### Reduce Costs
1. Use standard voices instead of neural
2. Disable TTS and use local client TTS
3. Enable TTS only for specific languages
4. Set rate limits to prevent abuse

## Security

### Best Practices
1. Enable authentication for production
2. Use secure session IDs
3. Set appropriate rate limits
4. Rotate JWT tokens regularly
5. Monitor for unusual activity

### Rate Limiting
- WebSocket messages: 10/second per client
- Polly requests: 60/minute per client
- Max clients per session: 50

## Monitoring

### Health Check
```bash
curl http://localhost:3001/health
```

### Logs
Server logs include:
- Connection events
- Session lifecycle
- TTS generation requests
- Error tracking
- Performance metrics

## Production Deployment

### Recommended Setup
1. Run on dedicated machine or VM
2. Use process manager (PM2, systemd)
3. Enable authentication
4. Configure firewall rules
5. Set up monitoring/alerting
6. Regular log rotation

### Example PM2 Config
```javascript
module.exports = {
  apps: [{
    name: 'tts-server',
    script: './dist/server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    }
  }]
}
```

## Admin Identity Store

### Overview

The AdminIdentityStore provides persistent admin authentication, allowing admins to reconnect and regain control of their sessions after disconnections or application restarts.

### File Structure

```
./admin-identities/
├── admin-index.json                                    # Username to adminId mapping
├── 550e8400-e29b-41d4-a716-446655440000.json          # Admin identity file
├── 6ba7b810-9dad-11d1-80b4-00c04fd430c8.json          # Admin identity file
└── cleanup-log.json                                    # Cleanup operation log
```

### Admin Identity Format

Each admin identity file contains:

```json
{
  "adminId": "550e8400-e29b-41d4-a716-446655440000",
  "username": "admin1",
  "createdAt": "2025-10-09T12:00:00.000Z",
  "lastSeen": "2025-10-09T14:30:00.000Z",
  "ownedSessions": ["SESSION-001", "SESSION-002"],
  "tokenVersion": 1,
  "refreshTokens": ["token1", "token2"]
}
```

### Index File Format

The admin-index.json file provides fast username lookups:

```json
{
  "version": 1,
  "lastUpdated": "2025-10-09T14:30:00.000Z",
  "usernameToAdminId": {
    "admin1": "550e8400-e29b-41d4-a716-446655440000",
    "admin2": "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
  }
}
```

### Lifecycle Management

**Retention Policy:**
- Admin identities are kept indefinitely while they have active sessions
- Admins with no owned sessions and no activity for 90 days are automatically cleaned up
- Cleanup runs daily at server startup and every 24 hours

**Token Management:**
- Refresh tokens are stored with admin identities
- Expired tokens are cleaned up during daily maintenance
- Token version tracking allows invalidation of all tokens for an admin

**Orphaned Session Handling:**
- Sessions owned by deleted admins are identified during cleanup
- Orphaned sessions can be reassigned to system admin
- Session ownership is validated on every operation

### Atomic Operations

All file writes use atomic operations to prevent corruption:

1. **Backup Creation**: Existing file is backed up before modification
2. **Temporary Write**: New content is written to a temporary file
3. **Atomic Rename**: Temporary file is renamed to target file (atomic operation)
4. **Cleanup**: Backup is removed on success, restored on failure

### File Locking

The store uses `proper-lockfile` for concurrent access protection:

```typescript
lockOptions = {
  stale: 10000,        // 10 seconds - consider lock stale after this
  retries: 3,          // Retry 3 times before failing
  retryDelay: 100      // Wait 100ms between retries
}
```

### API Reference

**Create Admin Identity**
```typescript
const identity = store.createAdminIdentity('username');
// Returns: AdminIdentity with new UUID
```

**Get Admin Identity**
```typescript
const identity = store.getAdminIdentity(adminId);
const identity = store.getAdminByUsername('username');
```

**Session Ownership**
```typescript
store.addOwnedSession(adminId, sessionId);
store.removeOwnedSession(adminId, sessionId);
```

**Token Management**
```typescript
store.addRefreshToken(adminId, token);
store.removeRefreshToken(adminId, token);
store.invalidateAllTokens(adminId);
```

**Lifecycle Operations**
```typescript
const cleanedCount = store.cleanupInactiveIdentities();
const tokenCount = store.cleanupExpiredTokens();
const orphaned = store.getOrphanedSessions(existingSessionIds);
store.reassignOrphanedSessions(orphaned, systemAdminId);
```

### Troubleshooting

#### Admin Identity Not Found
1. Check if admin-identities directory exists
2. Verify admin identity file exists: `ls admin-identities/*.json`
3. Check admin-index.json for username mapping
4. Review server logs for file read errors

#### Corrupted Index
- Server automatically rebuilds index on startup if corrupted
- Manual rebuild: Delete admin-index.json and restart server
- Index is regenerated from existing identity files

#### File Permission Issues
- Admin identity directory should have 700 permissions
- Identity files should have 600 permissions
- Check file ownership matches server process user

#### Cleanup Not Running
1. Verify server has been running for 24+ hours
2. Check cleanup-log.json for recent entries
3. Review server logs for cleanup errors
4. Manually trigger: Call `cleanupInactiveIdentities()` method

#### Orphaned Sessions
1. Check cleanup logs for deleted admins
2. Use `getOrphanedSessions()` to identify orphaned sessions
3. Reassign to system admin or delete sessions
4. Review session ownership in session files

### Performance Considerations

**Memory Usage:**
- Admin identities are loaded into memory on startup
- Active sockets are tracked in-memory only (not persisted)
- Typical memory usage: ~1KB per admin identity

**Disk I/O:**
- Writes are atomic but synchronous
- Index updates occur on every admin creation/deletion
- Cleanup operations scan all identity files

**Scalability:**
- Designed for small to medium deployments (< 1000 admins)
- File-based storage is simple but not suitable for high-scale
- Consider database backend for large deployments

## Error Handling System

### AdminErrorManager

The `AdminErrorManager` class provides centralized error handling for admin operations.

**Core Responsibilities:**
1. **Error Code Mapping**: Maps error codes to user-friendly messages
2. **Retryable Classification**: Determines if errors can be retried
3. **Security Event Logging**: Tracks authentication and authorization failures
4. **Audit Trail**: Maintains history of security events

**Creating Error Messages:**

```typescript
// Create standardized error message
const errorMessage = errorManager.createErrorMessage(
  AdminErrorCode.AUTH_INVALID_CREDENTIALS,
  {
    adminId: 'admin-uuid',
    operation: 'authentication'
  }
);

// Create error from exception
const errorMessage = errorManager.createErrorFromException(
  error,
  {
    adminId: 'admin-uuid',
    sessionId: 'CHURCH-2025-001',
    operation: 'start-session'
  }
);

// Create validation error
const errorMessage = errorManager.createValidationErrorMessage(
  ['Missing required field: sessionId', 'Invalid language code'],
  'start-session'
);
```

**Security Event Logging:**

```typescript
// Log security event
errorManager.logSecurityEvent(
  AdminErrorCode.AUTH_INVALID_CREDENTIALS,
  {
    adminId: 'admin-uuid',
    operation: 'authentication',
    details: { username: 'admin', ipAddress: '192.168.1.100' }
  }
);

// Get recent security events
const events = errorManager.getSecurityEvents(100);

// Get events for specific admin
const adminEvents = errorManager.getAdminSecurityEvents('admin-uuid', 50);

// Clean up old events
const deletedCount = errorManager.clearOldSecurityEvents(30); // 30 days
```

**Error Classification:**

```typescript
// Check if error is retryable
const canRetry = errorManager.isRetryable(errorCode);

// Get retry delay
const retryAfter = errorManager.getRetryDelay(errorCode);

// Check error type
const isAuthError = errorManager.isAuthenticationError(errorCode);
const isAuthzError = errorManager.isAuthorizationError(errorCode);
const isValidationError = errorManager.isValidationError(errorCode);
const isSystemError = errorManager.isSystemError(errorCode);
```

### AdminErrorMiddleware

The `AdminErrorMiddleware` class provides middleware functionality for error handling.

**Core Responsibilities:**
1. **Operation Wrapping**: Catches and standardizes errors
2. **Rate Limiting**: Tracks and enforces rate limits
3. **Validation**: Validates admin requests
4. **Error Response**: Sends formatted errors to clients

**Wrapping Operations:**

```typescript
// Wrap operation with error handling
const result = await errorMiddleware.wrapOperation(
  async () => {
    // Your operation here
    return await sessionManager.createSession(sessionId, config, adminId);
  },
  {
    adminId: 'admin-uuid',
    sessionId: 'CHURCH-2025-001',
    operation: 'create-session',
    ws: websocket
  }
);
```

**Rate Limiting:**

```typescript
// Check rate limit
const { allowed, retryAfter } = errorMiddleware.checkRateLimit(
  adminId,
  'authentication',
  10,  // limit: 10 attempts
  60   // window: 60 seconds
);

if (!allowed) {
  errorMiddleware.handleRateLimitExceeded(ws, adminId, 'authentication', retryAfter);
  return;
}

// Get rate limit status
const status = errorMiddleware.getRateLimitStatus(adminId, 'authentication');
// Returns: { count, limit, resetTime, remaining }

// Clean up old trackers
errorMiddleware.cleanupRateLimitTrackers();
```

**Request Validation:**

```typescript
// Validate admin request
const { valid, errors } = errorMiddleware.validateAdminRequest(
  request,
  ['sessionId', 'config']  // required fields
);

if (!valid) {
  errorMiddleware.handleValidationErrors(ws, errors, {
    adminId: 'admin-uuid',
    operation: 'start-session'
  });
  return;
}
```

**Error Handling Helpers:**

```typescript
// Handle authentication failure
errorMiddleware.handleAuthenticationFailure(
  ws,
  adminId,
  'invalid-credentials'
);

// Handle authorization failure
errorMiddleware.handleAuthorizationFailure(
  ws,
  adminId,
  sessionId,
  'end-session'
);

// Handle session not found
errorMiddleware.handleSessionNotFound(
  ws,
  sessionId,
  adminId,
  'end-session'
);

// Handle session operation failure
errorMiddleware.handleSessionOperationFailure(
  ws,
  AdminErrorCode.SESSION_CREATION_FAILED,
  {
    sessionId,
    adminId,
    operation: 'start-session',
    error: new Error('Database write failed')
  }
);
```

### Error Code Reference

See [MESSAGE_PROTOCOLS.md](./MESSAGE_PROTOCOLS.md#error-codes) for complete error code reference including:

- **Authentication Errors (AUTH_1001-1008)**: Invalid credentials, expired tokens, rate limiting
- **Authorization Errors (AUTHZ_1101-1104)**: Access denied, insufficient permissions
- **Session Management Errors (SESSION_1201-1207)**: Not found, creation failed, client limit
- **Admin Identity Errors (ADMIN_1301-1304)**: Identity not found, username taken
- **System Errors (SYSTEM_1401-1406)**: Internal error, database error, maintenance mode
- **Validation Errors (VALIDATION_1501-1505)**: Invalid input, missing fields

Each error code includes:
- Technical error message
- User-friendly message for UI display
- Retryable flag
- Optional retry delay

### Security Event Audit Trail

**Event Types Logged:**
1. Failed authentication attempts
2. Token expiry and validation failures
3. Authorization violations
4. Session ownership violations
5. Rate limit exceeded events

**Audit Trail Format:**
```json
{
  "timestamp": "2025-01-06T10:30:00.000Z",
  "errorCode": "AUTH_1001",
  "adminId": "550e8400-e29b-41d4-a716-446655440000",
  "operation": "authentication",
  "details": {
    "username": "admin",
    "reason": "invalid-credentials"
  }
}
```

**Retention Policy:**
- In-memory: Last 1000 events
- Log files: 30 days (configurable)
- Automatic cleanup of old events

**Monitoring Recommendations:**
1. Alert on > 5 failed auth attempts from same IP in 5 minutes
2. Alert on repeated authorization violations
3. Monitor rate limit hits for potential DoS attacks
4. Track token validation failures

### Integration Example

```typescript
import { AdminErrorManager } from './admin-error-manager';
import { AdminErrorMiddleware } from './admin-error-middleware';
import { ErrorLogger } from './error-logger';

// Initialize error handling system
const errorLogger = new ErrorLogger('./logs');
const errorManager = new AdminErrorManager(errorLogger);
const errorMiddleware = new AdminErrorMiddleware(errorManager);

// Use in message handler
async function handleStartSession(ws: WebSocket, message: any, adminId: string) {
  // Validate request
  const { valid, errors } = errorMiddleware.validateAdminRequest(
    message,
    ['sessionId', 'config']
  );
  
  if (!valid) {
    errorMiddleware.handleValidationErrors(ws, errors, {
      adminId,
      operation: 'start-session'
    });
    return;
  }
  
  // Check rate limit
  const { allowed, retryAfter } = errorMiddleware.checkRateLimit(
    adminId,
    'start-session',
    5,   // 5 sessions per minute
    60
  );
  
  if (!allowed) {
    errorMiddleware.handleRateLimitExceeded(ws, adminId, 'start-session', retryAfter);
    return;
  }
  
  // Execute operation with error handling
  try {
    const session = await errorMiddleware.wrapOperation(
      async () => {
        return await sessionManager.createSession(
          message.sessionId,
          message.config,
          adminId
        );
      },
      {
        adminId,
        sessionId: message.sessionId,
        operation: 'start-session',
        ws
      }
    );
    
    // Send success response
    ws.send(JSON.stringify({
      type: 'start-session-response',
      success: true,
      sessionId: session.sessionId,
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    // Error already handled by middleware
    console.error('Session creation failed:', error);
  }
}
```

## Support

For issues or questions:
1. Check server logs
2. Review configuration
3. Test with minimal setup
4. Check AWS service status
5. Verify network connectivity
6. Review security event logs for authentication issues
7. Check error codes in MESSAGE_PROTOCOLS.md


## Security Architecture

### JWT Token Security

The server implements comprehensive JWT token security with the following features:

#### Token Generation and Validation

**Secure Token Generation:**
- Uses cryptographically secure random JWT IDs (jti) for revocation tracking
- Configurable token expiry times (default: 1h for access, 30d for refresh)
- Token versioning to support bulk invalidation
- Signed with HS256/HS384/HS512 algorithms

**Token Validation:**
- Signature verification using secret key
- Issuer and audience claim validation
- Expiry time checking
- Token version verification
- Blacklist checking for revoked tokens

```typescript
// Generate token pair
const tokens = adminManager.generateTokenPair(adminId);
// Returns: { accessToken, refreshToken, accessTokenExpiry, refreshTokenExpiry }

// Validate token
const result = jwtSecurity.validateToken(token);
if (result.valid) {
  // Token is valid, use result.payload
} else {
  // Token is invalid, check result.errorCode
}
```

#### Token Revocation and Blacklist

**Token Blacklist System:**
- File-based persistent blacklist storage
- Automatic cleanup of expired blacklist entries
- Support for individual token revocation
- Bulk revocation via token version increment

**Revocation Methods:**

```typescript
// Revoke a specific token
jwtSecurity.revokeToken(token, 'User requested logout');

// Revoke all tokens for an admin (increment token version)
adminManager.invalidateAllTokens(adminId);

// Check if token is blacklisted
const isRevoked = jwtSecurity.isTokenBlacklisted(jti);
```

**Blacklist Configuration:**
```env
JWT_ENABLE_BLACKLIST=true
JWT_BLACKLIST_CLEANUP_INTERVAL_MS=3600000  # 1 hour
```

#### Token Refresh and Rotation

**Refresh Token Flow:**
1. Client sends refresh token before access token expires
2. Server validates refresh token
3. Server verifies token is in admin's refresh token list
4. Server generates new token pair
5. Old refresh token is removed, new one is stored

```typescript
// Refresh tokens
const newTokens = adminManager.refreshTokens(refreshToken);

// Automatic refresh scheduling
adminManager.scheduleAutoRefresh(
  adminId,
  refreshToken,
  tokenExpiry,
  (adminId, tokens, error) => {
    if (tokens) {
      // Send new tokens to client
    }
  }
);
```

#### Secret Key Management

**Secret Generation:**
- 256-bit (64 hex characters) cryptographically secure random secret
- Auto-generated on first server startup if not configured
- Stored in `.env` file with restricted permissions

**Secret Rotation:**
- Optional automatic rotation warnings
- Configurable rotation interval (default: 90 days)
- Manual rotation process documented below

```typescript
// Generate new secret
const newSecret = JWTSecurityManager.generateSecret();
```

**Secret Rotation Process:**
1. Generate new secret key
2. Update `JWT_SECRET` in `.env` file
3. Restart server
4. All existing tokens become invalid
5. Users must re-authenticate

**Configuration:**
```env
JWT_SECRET=                                    # Auto-generated if not set
JWT_SECRET_ROTATION_ENABLED=false              # Enable rotation warnings
JWT_SECRET_ROTATION_INTERVAL_DAYS=90           # Days between rotations
```

### Admin Operation Security

#### Security Middleware

The `AdminSecurityMiddleware` provides comprehensive security controls for all admin operations:

**Security Layers:**
1. **Identity Validation**: Verify admin identity exists and is valid
2. **Rate Limiting**: Prevent abuse with configurable rate limits
3. **Ownership Verification**: Ensure admins can only modify their own sessions
4. **Audit Logging**: Track all admin operations and security events

**Rate Limiting Configuration:**

```typescript
const rateLimitConfig = {
  authAttemptsPerMinute: 5,      // Max login attempts per minute
  authAttemptsPerHour: 20,       // Max login attempts per hour
  operationsPerMinute: 60,       // Max operations per minute
  operationsPerHour: 1000,       // Max operations per hour
  lockoutDurationMs: 900000,     // 15 minutes lockout
  lockoutThreshold: 10           // Failed attempts before lockout
};
```

**Environment Configuration:**
```env
# Rate Limiting
ADMIN_AUTH_RATE_LIMIT_PER_MINUTE=5
ADMIN_AUTH_RATE_LIMIT_PER_HOUR=20
ADMIN_OPERATION_RATE_LIMIT_PER_MINUTE=60
ADMIN_LOCKOUT_DURATION_MS=900000
ADMIN_LOCKOUT_THRESHOLD=10
```

#### Authentication Rate Limiting

**Per-IP Rate Limiting:**
- Limits authentication attempts by IP address
- Prevents brute force attacks
- Automatic lockout after threshold exceeded
- Configurable lockout duration

```typescript
// Check auth rate limit
const result = securityMiddleware.checkAuthRateLimit(ipAddress);
if (!result.valid) {
  // Rate limit exceeded, result.retryAfter contains seconds to wait
}

// Record failed authentication
securityMiddleware.recordAuthFailure(ipAddress);

// Reset on successful authentication
securityMiddleware.resetAuthRateLimit(ipAddress);
```

**Lockout Behavior:**
- After 10 failed attempts: 15-minute lockout
- Lockout applies to IP address, not username
- Automatic unlock after lockout period
- Security event logged for suspicious activity

#### Operation Rate Limiting

**Per-Admin Rate Limiting:**
- Limits operations per admin user
- Prevents API abuse
- Separate limits for different operation types
- Automatic reset after time window

```typescript
// Check operation rate limit
const result = securityMiddleware.checkOperationRateLimit(adminId);
if (!result.valid) {
  // Rate limit exceeded
}
```

#### Session Ownership Verification

**Ownership Checks:**
- All write operations require ownership verification
- Read operations allow viewing other admin's sessions
- Ownership violations logged as security events

```typescript
// Verify session ownership
const result = securityMiddleware.verifySessionOwnership(
  adminId,
  sessionId,
  AdminOperation.END_SESSION
);

if (!result.valid) {
  // Access denied - admin doesn't own session
}
```

**Write Operations Requiring Ownership:**
- `CREATE_SESSION`: Creating new sessions
- `END_SESSION`: Ending sessions
- `UPDATE_SESSION_CONFIG`: Modifying session configuration

**Read Operations (No Ownership Required):**
- `LIST_SESSIONS`: Viewing all sessions
- `ACCESS_SESSION`: Read-only access to session details

#### Security Event Logging

**Event Types:**
- `AUTH_SUCCESS`: Successful authentication
- `AUTH_FAILURE`: Failed authentication attempt
- `AUTH_RATE_LIMITED`: Rate limit exceeded
- `TOKEN_EXPIRED`: Token expiration
- `TOKEN_INVALID`: Invalid token used
- `ACCESS_DENIED`: Unauthorized access attempt
- `SESSION_OWNERSHIP_VIOLATION`: Attempt to modify unowned session
- `RATE_LIMIT_EXCEEDED`: Operation rate limit exceeded
- `SUSPICIOUS_ACTIVITY`: Multiple failed attempts or unusual behavior

**Security Event Structure:**

```typescript
interface SecurityEvent {
  timestamp: Date;
  eventType: SecurityEventType;
  adminId?: string;
  username?: string;
  operation?: AdminOperation;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorCode?: AdminErrorCode;
  errorMessage?: string;
  metadata?: Record<string, any>;
}
```

**Accessing Security Logs:**

```typescript
// Get admin's security events
const events = securityMiddleware.getAdminSecurityEvents(adminId, 100);

// Get recent security events
const recentEvents = securityMiddleware.getRecentSecurityEvents(100);

// Export audit log
const auditLog = securityMiddleware.exportAuditLog(startDate, endDate);

// Get security statistics
const stats = securityMiddleware.getSecurityStatistics();
// Returns: { totalEvents, authFailures, accessDenials, rateLimitViolations, suspiciousActivities, lockedAccounts }
```

#### Audit Trail

**Audit Logging Features:**
- All admin operations logged with timestamp
- Security events tracked separately
- Failed authentication attempts recorded
- Session ownership violations logged
- Rate limit violations tracked
- Exportable audit log for compliance

**Audit Log Retention:**
- In-memory storage of last 10,000 events
- Automatic cleanup of old events
- Export capability for long-term storage
- Console logging for important security events

### Security Best Practices

#### For Administrators

1. **Strong JWT Secrets:**
   - Use auto-generated secrets (64 hex characters)
   - Never commit secrets to version control
   - Store in `.env` file with restricted permissions (600)
   - Rotate secrets every 90 days

2. **Token Management:**
   - Keep access token expiry short (1 hour recommended)
   - Use refresh tokens for long-lived sessions
   - Revoke tokens on logout
   - Monitor blacklist size and cleanup

3. **Rate Limiting:**
   - Configure appropriate rate limits for your use case
   - Monitor rate limit violations
   - Adjust lockout thresholds based on security needs
   - Review locked accounts regularly

4. **Audit Logging:**
   - Regularly review security event logs
   - Export audit logs for compliance
   - Monitor for suspicious activity patterns
   - Investigate authentication failures

5. **Network Security:**
   - Use WSS (WebSocket Secure) in production
   - Configure firewall rules
   - Implement IP whitelisting if needed
   - Use reverse proxy for additional security

#### For Developers

1. **Token Validation:**
   - Always validate tokens before operations
   - Check token expiry and version
   - Verify token hasn't been revoked
   - Handle token errors gracefully

2. **Error Handling:**
   - Use structured error codes
   - Provide user-friendly error messages
   - Log security events appropriately
   - Implement retry logic for transient errors

3. **Session Management:**
   - Verify session ownership for write operations
   - Allow read-only access for monitoring
   - Clean up sessions on admin disconnect
   - Handle concurrent connections properly

4. **Security Testing:**
   - Test rate limiting behavior
   - Verify token revocation works
   - Test authentication failure scenarios
   - Validate ownership checks

### Security Configuration Reference

```env
# JWT Security
JWT_SECRET=                                    # Auto-generated if not set
JWT_ALGORITHM=HS256                            # HS256, HS384, or HS512
JWT_ISSUER=service-translate-ws
JWT_AUDIENCE=service-translate-admin
JWT_ACCESS_TOKEN_EXPIRY=1h                     # 1 hour
JWT_REFRESH_TOKEN_EXPIRY=30d                   # 30 days
JWT_ENABLE_BLACKLIST=true
JWT_BLACKLIST_CLEANUP_INTERVAL_MS=3600000      # 1 hour
JWT_SECRET_ROTATION_ENABLED=false
JWT_SECRET_ROTATION_INTERVAL_DAYS=90

# Rate Limiting
ADMIN_AUTH_RATE_LIMIT_PER_MINUTE=5
ADMIN_AUTH_RATE_LIMIT_PER_HOUR=20
ADMIN_OPERATION_RATE_LIMIT_PER_MINUTE=60
ADMIN_OPERATION_RATE_LIMIT_PER_HOUR=1000
ADMIN_LOCKOUT_DURATION_MS=900000               # 15 minutes
ADMIN_LOCKOUT_THRESHOLD=10

# Security Logging
ENABLE_SECURITY_LOGGING=true
SECURITY_LOG_MAX_SIZE=10000
```

### Troubleshooting Security Issues

#### Token Validation Failures

**Problem:** Tokens are being rejected as invalid

**Solutions:**
1. Check JWT secret is correctly configured
2. Verify token hasn't expired
3. Ensure token version matches admin's current version
4. Check if token has been revoked/blacklisted
5. Verify issuer and audience claims match configuration

#### Rate Limiting Issues

**Problem:** Users getting rate limited unexpectedly

**Solutions:**
1. Review rate limit configuration
2. Check if multiple users share same IP (NAT)
3. Verify rate limit counters are resetting properly
4. Consider increasing limits for legitimate use cases
5. Check for automated scripts causing excessive requests

#### Authentication Lockouts

**Problem:** Users locked out after failed attempts

**Solutions:**
1. Verify lockout threshold is appropriate
2. Check if IP address is correct (proxy/NAT issues)
3. Review security logs for failed attempts
4. Manually clear lockout if needed
5. Educate users on correct credentials

#### Session Ownership Violations

**Problem:** Admins can't access their own sessions

**Solutions:**
1. Verify admin identity is correctly registered
2. Check session was created with correct admin ID
3. Review session ownership in session files
4. Ensure token contains correct admin ID
5. Check for token version mismatches

