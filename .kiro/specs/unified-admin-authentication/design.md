# Design Document

## Overview

This design unifies the three separate admin authentication mechanisms (Cognito, WebSocket local auth, and implicit super admin) into a single Cognito-based authentication system. The WebSocket server will validate admin credentials against AWS Cognito instead of maintaining its own local credential store.

## Architecture

### Current Architecture (Problematic)

```
┌─────────────────────────────────────────┐
│         Capture Electron App            │
│                                         │
│  ┌──────────────┐  ┌──────────────┐   │
│  │ Cognito Auth │  │ WS Local Auth│   │
│  │ (AWS Svcs)   │  │ (Sessions)   │   │
│  │              │  │              │   │
│  │ user@email   │  │ admin/pass   │   │
│  └──────┬───────┘  └──────┬───────┘   │
└─────────┼──────────────────┼───────────┘
          │                  │
          ▼                  ▼
   ┌─────────────┐    ┌─────────────┐
   │ AWS Cognito │    │ WebSocket   │
   │             │    │ Server      │
   │             │    │ (.env creds)│
   └─────────────┘    └─────────────┘
```

**Problems:**
- Two separate credential sets
- Duplicate admin management
- Confusion about which credentials to use
- Synchronization issues
- Complex setup process

### New Architecture (Simplified)

```
┌─────────────────────────────────────────┐
│         Capture Electron App            │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │    Unified Cognito Auth          │  │
│  │    (AWS Services + Sessions)     │  │
│  │                                  │  │
│  │    user@email / password         │  │
│  └──────────────┬───────────────────┘  │
└─────────────────┼──────────────────────┘
                  │
                  │ Cognito Tokens
                  │
         ┌────────┴────────┐
         │                 │
         ▼                 ▼
  ┌─────────────┐   ┌─────────────┐
  │ AWS Cognito │   │ WebSocket   │
  │             │   │ Server      │
  │             │   │ (validates  │
  │             │   │  Cognito)   │
  └─────────────┘   └─────────────┘
```

**Benefits:**
- Single credential set
- Centralized admin management in Cognito
- Clear authentication flow
- Simplified setup
- No credential duplication

## Components and Interfaces

### 1. Cognito Integration Module (New)

**Location:** `src/websocket-server/src/cognito-auth.ts`

**Purpose:** Validates Cognito tokens and authenticates users using amazon-cognito-identity-js

**Authentication Method:**
- Uses `amazon-cognito-identity-js` library with USER_PASSWORD_AUTH flow
- No AWS admin SDK required (avoids needing AWS credentials on WebSocket server)
- User Pool Client must be configured as public client with no secret
- Required auth flows: ALLOW_USER_PASSWORD_AUTH, ALLOW_REFRESH_TOKEN_AUTH

```typescript
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession
} from 'amazon-cognito-identity-js';

interface CognitoConfig {
  region: string;
  userPoolId: string;
  clientId: string;
}

interface CognitoUserInfo {
  sub: string;           // Cognito user ID (UUID)
  email: string;         // User email
  username: string;      // Username
  'cognito:groups'?: string[]; // User groups (for future RBAC)
}

class CognitoAuthService {
  private userPool: CognitoUserPool;
  
  constructor(config: CognitoConfig) {
    this.userPool = new CognitoUserPool({
      UserPoolId: config.userPoolId,
      ClientId: config.clientId
    });
  }
  
  /**
   * Authenticate user with username/password
   * Uses CognitoUser.authenticateUser() with USER_PASSWORD_AUTH flow
   * Returns Cognito tokens if valid
   */
  async authenticateUser(username: string, password: string): Promise<{
    accessToken: string;
    idToken: string;
    refreshToken: string;
    expiresIn: number;
    userInfo: CognitoUserInfo;
  }> {
    const authDetails = new AuthenticationDetails({
      Username: username,
      Password: password
    });
    
    const cognitoUser = new CognitoUser({
      Username: username,
      Pool: this.userPool
    });
    
    return new Promise((resolve, reject) => {
      cognitoUser.authenticateUser(authDetails, {
        onSuccess: (session: CognitoUserSession) => {
          const accessToken = session.getAccessToken().getJwtToken();
          const idToken = session.getIdToken().getJwtToken();
          const refreshToken = session.getRefreshToken().getToken();
          
          resolve({
            accessToken,
            idToken,
            refreshToken,
            expiresIn: session.getAccessToken().getExpiration(),
            userInfo: {
              sub: session.getIdToken().payload.sub,
              email: session.getIdToken().payload.email,
              username: session.getIdToken().payload['cognito:username'],
              'cognito:groups': session.getIdToken().payload['cognito:groups']
            }
          });
        },
        onFailure: (err) => {
          reject(err);
        }
      });
    });
  }
  
  /**
   * Validate Cognito access token
   * Returns user info if valid, throws error if invalid
   */
  async validateToken(accessToken: string): Promise<CognitoUserInfo> {
    // Token validation happens automatically in getSession()
    // This method extracts user info from a valid token
    const payload = this.decodeToken(accessToken);
    return {
      sub: payload.sub,
      email: payload.email,
      username: payload['cognito:username'],
      'cognito:groups': payload['cognito:groups']
    };
  }
  
  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(username: string, refreshToken: string): Promise<{
    accessToken: string;
    expiresIn: number;
  }> {
    const cognitoUser = new CognitoUser({
      Username: username,
      Pool: this.userPool
    });
    
    return new Promise((resolve, reject) => {
      cognitoUser.refreshSession(refreshToken, (err, session) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            accessToken: session.getAccessToken().getJwtToken(),
            expiresIn: session.getAccessToken().getExpiration()
          });
        }
      });
    });
  }
  
  private decodeToken(token: string): any {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(base64, 'base64').toString());
  }
}
```

### 2. Updated AdminIdentityManager

**Location:** `src/websocket-server/src/admin-identity-manager.ts`

**Changes:**
- Remove local credential validation
- Use Cognito user ID (sub) as adminId
- Validate all admin operations against Cognito tokens
- Store Cognito user info in admin identity

```typescript
interface AdminIdentity {
  adminId: string;           // Cognito sub (UUID)
  cognitoUsername: string;   // Cognito username
  email: string;             // Cognito email
  createdAt: Date;
  lastSeen: Date;
  activeSockets: Set<string>;
  ownedSessions: Set<string>;
  cognitoGroups?: string[];  // Cognito groups for future RBAC
}

class AdminIdentityManager {
  constructor(
    private identityStore: AdminIdentityStore,
    private cognitoAuth: CognitoAuthService
  );
  
  /**
   * Authenticate admin using Cognito credentials
   */
  async authenticateWithCredentials(
    username: string,
    password: string,
    socketId: string
  ): Promise<{
    adminId: string;
    cognitoTokens: CognitoTokens;
    ownedSessions: string[];
  }>;
  
  /**
   * Authenticate admin using Cognito access token
   */
  async authenticateWithToken(
    accessToken: string,
    socketId: string
  ): Promise<{
    adminId: string;
    ownedSessions: string[];
  }>;
  
  /**
   * Refresh Cognito tokens
   */
  async refreshTokens(
    refreshToken: string
  ): Promise<{
    accessToken: string;
    expiresIn: number;
  }>;
  
  // Existing methods remain but use Cognito-based adminId
  connectAdmin(adminId: string, socketId: string): void;
  disconnectAdmin(socketId: string): void;
  getAdminBySocketId(socketId: string): AdminIdentity | null;
  // ... other methods
}
```

### 3. Updated Message Router

**Location:** `src/websocket-server/src/message-router.ts`

**Changes:**
- Accept Cognito credentials or tokens for authentication
- Remove local credential validation
- Pass Cognito tokens to AdminIdentityManager

```typescript
// Authentication message handling
async handleAdminAuth(socket: Socket, message: AdminAuthMessage): Promise<void> {
  if (message.method === 'credentials') {
    // Authenticate with Cognito
    const result = await this.adminIdentityManager.authenticateWithCredentials(
      message.username,
      message.password,
      socket.id
    );
    
    // Return Cognito tokens to client
    socket.emit('admin-auth-response', {
      success: true,
      adminId: result.adminId,
      accessToken: result.cognitoTokens.accessToken,
      idToken: result.cognitoTokens.idToken,
      refreshToken: result.cognitoTokens.refreshToken,
      expiresIn: result.cognitoTokens.expiresIn,
      ownedSessions: result.ownedSessions
    });
  } else if (message.method === 'token') {
    // Authenticate with existing Cognito token
    const result = await this.adminIdentityManager.authenticateWithToken(
      message.accessToken,
      socket.id
    );
    
    socket.emit('admin-auth-response', {
      success: true,
      adminId: result.adminId,
      ownedSessions: result.ownedSessions
    });
  }
}
```

### 4. Updated Capture App WebSocket Manager

**Location:** `src/capture/src/websocket-manager.ts`

**Changes:**
- Use Cognito credentials from app config
- Store Cognito tokens instead of custom JWT
- Refresh Cognito tokens when needed

```typescript
class WebSocketManager {
  private cognitoAccessToken: string | null = null;
  private cognitoRefreshToken: string | null = null;
  private cognitoIdToken: string | null = null;
  
  /**
   * Authenticate with WebSocket server using Cognito credentials
   */
  async authenticateWithCognito(username: string, password: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.emit('admin-auth', {
        type: 'admin-auth',
        method: 'credentials',
        username,
        password
      });
      
      this.socket.once('admin-auth-response', (response) => {
        if (response.success) {
          this.adminId = response.adminId;
          this.cognitoAccessToken = response.accessToken;
          this.cognitoIdToken = response.idToken;
          this.cognitoRefreshToken = response.refreshToken;
          
          // Store tokens for reconnection
          this.storeTokens();
          resolve();
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }
  
  /**
   * Reconnect using stored Cognito token
   */
  async reconnectWithToken(): Promise<void> {
    const token = this.loadStoredToken();
    if (!token) {
      throw new Error('No stored token available');
    }
    
    return new Promise((resolve, reject) => {
      this.socket.emit('admin-auth', {
        type: 'admin-auth',
        method: 'token',
        accessToken: token
      });
      
      this.socket.once('admin-auth-response', (response) => {
        if (response.success) {
          this.adminId = response.adminId;
          resolve();
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }
  
  /**
   * Refresh Cognito tokens
   */
  async refreshCognitoTokens(): Promise<void> {
    if (!this.cognitoRefreshToken) {
      throw new Error('No refresh token available');
    }
    
    return new Promise((resolve, reject) => {
      this.socket.emit('token-refresh', {
        type: 'token-refresh',
        refreshToken: this.cognitoRefreshToken
      });
      
      this.socket.once('token-refresh-response', (response) => {
        if (response.success) {
          this.cognitoAccessToken = response.accessToken;
          this.storeTokens();
          resolve();
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }
}
```

## Data Models

### AdminIdentity (Updated)

```typescript
interface AdminIdentity {
  adminId: string;           // Cognito sub (UUID) - PRIMARY KEY
  cognitoUsername: string;   // Cognito username
  email: string;             // Cognito email
  createdAt: Date;           // First seen timestamp
  lastSeen: Date;            // Last activity timestamp
  activeSockets: Set<string>; // Current WebSocket connections
  ownedSessions: Set<string>; // Sessions created by this admin
  cognitoGroups?: string[];  // Cognito groups (for future RBAC)
}
```

**File Storage:** `./admin-identities/{cognitoSub}.json`

**Index File:** `./admin-identities/admin-index.json`
```json
{
  "email-to-id": {
    "admin@example.com": "cognito-sub-uuid"
  },
  "username-to-id": {
    "admin": "cognito-sub-uuid"
  }
}
```

### SessionData (No Changes)

```typescript
interface SessionData {
  sessionId: string;
  adminId: string;                    // Cognito sub (UUID)
  currentAdminSocketId: string | null;
  createdBy: string;                  // Cognito username or email
  config: SessionConfig;
  clients: Map<string, ClientData>;
  createdAt: Date;
  lastActivity: Date;
  status: SessionStatus;
}
```

## Token Storage Strategy

### WebSocket Server: Memory Only

**Rationale:** Simplicity over persistence. Tokens expire anyway, and requiring re-authentication on server restart is acceptable for this use case.

```typescript
class TokenStore {
  // In-memory storage only
  private activeTokens: Map<string, {
    accessToken: string;
    adminId: string;
    expiresAt: Date;
  }> = new Map();
  
  storeToken(socketId: string, accessToken: string, adminId: string, expiresIn: number): void {
    this.activeTokens.set(socketId, {
      accessToken,
      adminId,
      expiresAt: new Date(Date.now() + expiresIn * 1000)
    });
  }
  
  getToken(socketId: string): string | null {
    const token = this.activeTokens.get(socketId);
    if (!token) return null;
    
    // Check if expired
    if (token.expiresAt < new Date()) {
      this.activeTokens.delete(socketId);
      return null;
    }
    
    return token.accessToken;
  }
  
  removeToken(socketId: string): void {
    this.activeTokens.delete(socketId);
  }
  
  // On server restart, all tokens are lost
  // Admins must re-authenticate
}
```

### Capture App: Encrypted File Storage

**Rationale:** Persist tokens across app restarts for better UX, but store securely.

```typescript
import { safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

class SecureTokenStorage {
  private tokenFilePath: string;
  
  constructor(appDataPath: string) {
    this.tokenFilePath = path.join(appDataPath, 'cognito-tokens.enc');
  }
  
  /**
   * Store Cognito tokens encrypted using Electron safeStorage
   */
  storeTokens(tokens: {
    accessToken: string;
    idToken: string;
    refreshToken: string;
    expiresAt: Date;
  }): void {
    const tokenData = JSON.stringify(tokens);
    const encrypted = safeStorage.encryptString(tokenData);
    fs.writeFileSync(this.tokenFilePath, encrypted);
  }
  
  /**
   * Load and decrypt stored tokens
   */
  loadTokens(): {
    accessToken: string;
    idToken: string;
    refreshToken: string;
    expiresAt: Date;
  } | null {
    if (!fs.existsSync(this.tokenFilePath)) {
      return null;
    }
    
    try {
      const encrypted = fs.readFileSync(this.tokenFilePath);
      const decrypted = safeStorage.decryptString(encrypted);
      return JSON.parse(decrypted);
    } catch (error) {
      console.error('Failed to load tokens:', error);
      return null;
    }
  }
  
  /**
   * Clear stored tokens
   */
  clearTokens(): void {
    if (fs.existsSync(this.tokenFilePath)) {
      fs.unlinkSync(this.tokenFilePath);
    }
  }
}
```

### Token Lifecycle

**On Server Restart:**
- All in-memory tokens are lost
- Admins must re-authenticate
- Sessions are preserved (not affected by server restart)

**Access Token Expiry:**
- Client checks token expiry every 5 minutes
- If less than 10 minutes remaining, automatically refresh
- Refresh uses Cognito refresh token
- New access token stored in memory (server) and encrypted file (client)

**Refresh Token Expiry:**
- Admin must re-authenticate with username/password
- Sessions are preserved and re-associated with new tokens
- Client shows "Session expired, please login again" message

**User Deleted from Cognito:**
- Server detects on next token validation
- All admin's sessions are terminated
- All admin's sockets are disconnected
- Admin identity is marked as deleted

## Error Handling

### Cognito-Specific Errors

```typescript
enum CognitoErrorCode {
  INVALID_CREDENTIALS = 'COGNITO_1001',
  TOKEN_EXPIRED = 'COGNITO_1002',
  TOKEN_INVALID = 'COGNITO_1003',
  USER_NOT_FOUND = 'COGNITO_1004',
  USER_DISABLED = 'COGNITO_1005',
  COGNITO_UNAVAILABLE = 'COGNITO_1006',
  REFRESH_TOKEN_EXPIRED = 'COGNITO_1007',
  INSUFFICIENT_PERMISSIONS = 'COGNITO_1008'
}

const COGNITO_ERROR_MESSAGES = {
  COGNITO_1001: 'Invalid username or password',
  COGNITO_1002: 'Access token has expired. Please refresh or re-authenticate',
  COGNITO_1003: 'Invalid or malformed access token',
  COGNITO_1004: 'User not found in Cognito',
  COGNITO_1005: 'User account is disabled',
  COGNITO_1006: 'Unable to connect to Cognito service',
  COGNITO_1007: 'Refresh token has expired. Please re-authenticate',
  COGNITO_1008: 'User does not have required permissions'
};

// Error Recovery Actions
const ERROR_RECOVERY_ACTIONS = {
  COGNITO_1001: 'Verify username and password are correct. Check Cognito User Pool for user status.',
  COGNITO_1002: 'Client should automatically refresh token. If refresh fails, re-authenticate.',
  COGNITO_1003: 'Clear stored tokens and re-authenticate. Check token format and signature.',
  COGNITO_1004: 'User may have been deleted from Cognito. Create new user or use existing user.',
  COGNITO_1005: 'Enable user account in Cognito User Pool console.',
  COGNITO_1006: 'Check network connectivity. Verify Cognito User Pool ID and region are correct.',
  COGNITO_1007: 'Re-authenticate with username and password. Sessions will be preserved.',
  COGNITO_1008: 'Verify user has required Cognito groups (if RBAC is enabled).'
};
```

### Error Handling Flow

```typescript
try {
  const user = await cognitoAuth.validateToken(accessToken);
  // Proceed with authenticated operation
} catch (error) {
  if (error.code === 'NotAuthorizedException') {
    throw new AdminError(
      CognitoErrorCode.INVALID_CREDENTIALS,
      COGNITO_ERROR_MESSAGES.COGNITO_1001
    );
  } else if (error.code === 'TokenExpiredException') {
    throw new AdminError(
      CognitoErrorCode.TOKEN_EXPIRED,
      COGNITO_ERROR_MESSAGES.COGNITO_1002
    );
  } else if (error.code === 'UserNotFoundException') {
    throw new AdminError(
      CognitoErrorCode.USER_NOT_FOUND,
      COGNITO_ERROR_MESSAGES.COGNITO_1004
    );
  }
  // ... handle other Cognito errors
}
```

## Testing Strategy

### Unit Tests

1. **CognitoAuthService Tests**
   - Token validation with valid/invalid tokens
   - User authentication with correct/incorrect credentials
   - Token refresh with valid/expired refresh tokens
   - Error handling for various Cognito errors

2. **AdminIdentityManager Tests**
   - Cognito-based authentication flow
   - Admin identity creation from Cognito user
   - Session ownership with Cognito IDs
   - Token refresh handling

3. **Message Router Tests**
   - Admin auth with Cognito credentials
   - Admin auth with Cognito tokens
   - Token refresh requests
   - Error responses for invalid Cognito auth

### Integration Tests

1. **End-to-End Authentication Flow**
   - Capture app → Cognito → WebSocket server
   - Token storage and reconnection
   - Token refresh before expiry
   - Session recovery after reconnection

2. **Multi-Admin Scenarios**
   - Multiple Cognito users creating sessions
   - Session ownership verification
   - Concurrent admin connections

3. **Error Scenarios**
   - Cognito service unavailable
   - Expired tokens
   - Disabled user accounts
   - Invalid credentials

## Configuration Changes

### Environment Variables (Updated)

**Remove:**
```bash
# DEPRECATED - No longer needed
# ADMIN_USERNAME=admin
# ADMIN_PASSWORD=your-password
# JWT_SECRET=auto-generated
# JWT_ALGORITHM=HS256
# JWT_ISSUER=service-translate-ws
# JWT_AUDIENCE=service-translate-admin
# JWT_ACCESS_TOKEN_EXPIRY=1h
# JWT_REFRESH_TOKEN_EXPIRY=30d
```

**Add:**
```bash
# Cognito Configuration (REQUIRED)
# Source: Get from CDK output after deploying backend stack
# Validation: Server checks on startup, fails fast if missing
COGNITO_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_xxxxxx
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx

# Admin Identity Persistence
ADMIN_IDENTITIES_DIR=./admin-identities
ADMIN_IDENTITY_CLEANUP_ENABLED=true
ADMIN_IDENTITY_RETENTION_DAYS=90

# Session Configuration (unchanged)
SESSION_PERSISTENCE_DIR=./sessions
SESSION_TIMEOUT_MINUTES=480
SESSION_CLEANUP_ENABLED=true
```

**Cognito User Pool Client Configuration:**

The Cognito User Pool Client must be configured with:
- **Client Type:** Public client (no secret)
- **Auth Flows:** 
  - ALLOW_USER_PASSWORD_AUTH (enabled)
  - ALLOW_REFRESH_TOKEN_AUTH (enabled)
- **Token Expiry:**
  - Access Token: 1 hour (default)
  - ID Token: 1 hour (default)
  - Refresh Token: 30 days (default)
- **Read/Write Attributes:** email, preferred_username (minimum)

### Capture App Configuration

The Capture app already has Cognito configuration for AWS services. We'll reuse the same configuration for WebSocket authentication:

```typescript
// src/capture/src/config.ts
interface AppConfig {
  aws: {
    region: string;
    userPoolId: string;
    clientId: string;
    identityPoolId: string;
  };
  websocket: {
    url: string;
    port: number;
    // No longer needs separate auth config
  };
}
```

## Setup Process

### New Simplified Setup

**Single Setup Script:** `setup-unified-auth.sh`

```bash
#!/bin/bash
# Unified Authentication Setup

echo "Service Translate - Unified Authentication Setup"
echo ""

# Step 1: Check if Cognito stack is deployed
echo "Checking AWS Cognito configuration..."
if [ -z "$COGNITO_USER_POOL_ID" ]; then
  echo "Error: Cognito User Pool not found"
  echo "Please deploy the backend CDK stack first:"
  echo "  cd src/backend && npm run deploy"
  exit 1
fi

# Step 2: Configure WebSocket server
echo "Configuring WebSocket server..."
cat > src/websocket-server/.env << EOF
AWS_REGION=$AWS_REGION
COGNITO_USER_POOL_ID=$COGNITO_USER_POOL_ID
COGNITO_CLIENT_ID=$COGNITO_CLIENT_ID

ADMIN_IDENTITIES_DIR=./admin-identities
SESSION_PERSISTENCE_DIR=./sessions
EOF

# Step 3: Create directories
mkdir -p src/websocket-server/admin-identities
mkdir -p src/websocket-server/sessions

echo ""
echo "Setup complete!"
echo ""
echo "The WebSocket server will work with any existing Cognito user."
echo ""
echo "Optional: Create a new admin user in Cognito"
read -p "Do you want to create a new Cognito user? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  read -p "Enter admin email: " ADMIN_EMAIL
  read -s -p "Enter admin password: " ADMIN_PASSWORD
  echo ""
  
  aws cognito-idp admin-create-user \
    --user-pool-id $COGNITO_USER_POOL_ID \
    --username $ADMIN_EMAIL \
    --user-attributes Name=email,Value=$ADMIN_EMAIL \
    --temporary-password $ADMIN_PASSWORD
  
  echo "Admin user created: $ADMIN_EMAIL"
fi

echo ""
echo "Next steps:"
echo "1. Start WebSocket server: cd src/websocket-server && npm start"
echo "2. Start Capture app: cd src/capture && npm start"
echo "3. Login with any Cognito user credentials"
```

## Migration Strategy

**BREAKING CHANGE:** This is a breaking change that requires clean installation.

### For New Installations
- Follow the new unified setup process
- No migration needed

### For Existing Installations

**Required Steps:**
1. **Backup** (optional, for reference only):
   ```bash
   cp -r src/websocket-server/admin-identities src/websocket-server/admin-identities.backup
   cp -r src/websocket-server/sessions src/websocket-server/sessions.backup
   ```

2. **Clean Installation:**
   ```bash
   # Delete old data
   rm -rf src/websocket-server/admin-identities
   rm -rf src/websocket-server/sessions
   
   # Run new setup
   ./setup-unified-auth.sh
   ```

3. **Update Code:**
   - Pull latest code with Cognito integration
   - Install new dependencies: `npm install`
   - Update .env with Cognito configuration

4. **Re-authenticate:**
   - All admins must login again with Cognito credentials
   - Sessions will be recreated on first use

**No Automatic Migration:**
- Complexity not worth it for early-stage project
- Clean start ensures no legacy data issues
- Simplifies codebase and reduces technical debt

**Document in CHANGELOG.md:**
```markdown
## [2.0.0] - 2025-10-XX

### BREAKING CHANGES

- **Unified Admin Authentication**: Replaced local WebSocket authentication with Cognito-based authentication
  - All admins must use Cognito credentials
  - Existing admin identities and sessions must be deleted
  - No automatic migration provided
  - See ADMIN_AUTHENTICATION_GUIDE.md for setup instructions

### Migration Steps

1. Backup existing data (optional): `cp -r admin-identities admin-identities.backup`
2. Delete old data: `rm -rf admin-identities sessions`
3. Run setup: `./setup-unified-auth.sh`
4. Re-authenticate with Cognito credentials
```

## Security Considerations

### Benefits of Cognito-Based Auth

1. **Centralized Security:** Cognito handles password policies, MFA, account recovery
2. **Token Management:** Cognito manages token lifecycle, rotation, revocation
3. **Audit Trail:** Cognito provides authentication logs and monitoring
4. **Scalability:** Cognito scales automatically with user base
5. **Compliance:** Cognito is SOC 2, ISO 27001, HIPAA compliant

### Security Best Practices

1. **Token Storage:**
   - Store Cognito tokens securely in Electron app
   - Use encrypted storage for refresh tokens
   - Clear tokens on logout

2. **Token Validation:**
   - Validate tokens on every admin operation
   - Check token expiry before operations
   - Refresh tokens proactively

3. **Network Security:**
   - Use WSS (encrypted WebSocket) in production
   - Validate Cognito tokens server-side
   - Rate limit authentication attempts

4. **Access Control:**
   - Use Cognito groups for role-based access (future)
   - Verify admin permissions for sensitive operations
   - Log all admin actions

## Dependencies

### New NPM Packages

```json
{
  "dependencies": {
    "amazon-cognito-identity-js": "^6.3.6",
    "aws-sdk": "^2.1490.0"
  }
}
```

### AWS SDK Usage

```typescript
import { CognitoIdentityProviderClient, InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";
import { CognitoJwtVerifier } from "aws-jwt-verify";
```

## Rollback Plan

If issues arise with Cognito integration:

1. **Immediate Rollback:**
   - Revert to previous version with local auth
   - Restore .env with local credentials
   - Restart WebSocket server

2. **Data Preservation:**
   - Admin identities remain in file system
   - Sessions remain unchanged
   - No data loss during rollback

3. **Gradual Migration:**
   - Run both auth systems in parallel (feature flag)
   - Gradually migrate admins to Cognito
   - Remove local auth once all admins migrated

## Future Enhancements

1. **Role-Based Access Control (RBAC):**
   - Use Cognito groups for admin roles
   - Different permissions for different admin types
   - Fine-grained session access control

2. **Multi-Factor Authentication (MFA):**
   - Enable Cognito MFA for admin accounts
   - Require MFA for sensitive operations

3. **Federated Identity:**
   - Support SAML/OAuth providers via Cognito
   - Corporate SSO integration

4. **Admin Management UI:**
   - Web-based admin user management
   - Cognito user pool administration
   - Session monitoring dashboard
