# Admin Security Implementation Guide

## Overview

This document provides a comprehensive guide to the admin security implementation using AWS Cognito authentication, including Cognito token security, encrypted token storage, rate limiting, audit logging, and best practices.

## Authentication Architecture

The system uses AWS Cognito as the single source of truth for admin authentication, providing enterprise-grade security with centralized user management.

```
┌─────────────────────────────────────────────────────────┐
│                  Capture Electron App                    │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Cognito Authentication                          │  │
│  │  - Credential validation                         │  │
│  │  - Token management                              │  │
│  │  - Encrypted token storage                       │  │
│  │  - Automatic token refresh                       │  │
│  └──────────────────┬───────────────────────────────┘  │
└─────────────────────┼──────────────────────────────────┘
                      │
                      │ Cognito Tokens (Access, ID, Refresh)
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

## Components

### 1. Cognito Authentication Service (`cognito-auth.ts`)

The Cognito Authentication Service handles all Cognito authentication operations using the `amazon-cognito-identity-js` library.

**Features:**
- User authentication with USER_PASSWORD_AUTH flow
- Token validation and refresh
- User information extraction from tokens
- Cognito error handling and mapping
- No AWS admin SDK required (works without AWS credentials)

**Usage Example:**

```typescript
import { CognitoAuthService } from './cognito-auth';

// Initialize
const cognitoAuth = new CognitoAuthService({
  region: process.env.COGNITO_REGION!,
  userPoolId: process.env.COGNITO_USER_POOL_ID!,
  clientId: process.env.COGNITO_CLIENT_ID!
});

// Authenticate user
const result = await cognitoAuth.authenticateUser(username, password);
console.log('Access token:', result.accessToken);
console.log('User info:', result.userInfo);

// Validate token
const userInfo = await cognitoAuth.validateToken(accessToken);
console.log('Token is valid for user:', userInfo.sub);

// Refresh token
const newTokens = await cognitoAuth.refreshAccessToken(username, refreshToken);
console.log('New access token:', newTokens.accessToken);
```

### 2. Secure Token Storage (`secure-token-storage.ts`)

The Secure Token Storage component provides encrypted storage for Cognito tokens on the client side using Electron's safeStorage API.

**Features:**
- Encrypted token storage using Electron safeStorage
- Secure persistence across app restarts
- Automatic token cleanup on logout
- Platform-specific encryption (Keychain on macOS, DPAPI on Windows)

**Usage Example:**

```typescript
import { SecureTokenStorage } from './secure-token-storage';

// Initialize
const tokenStorage = new SecureTokenStorage(app.getPath('userData'));

// Store tokens
tokenStorage.storeTokens({
  accessToken: 'cognito-access-token',
  idToken: 'cognito-id-token',
  refreshToken: 'cognito-refresh-token',
  expiresAt: new Date(Date.now() + 3600000)
});

// Load tokens
const tokens = tokenStorage.loadTokens();
if (tokens && tokens.expiresAt > new Date()) {
  console.log('Valid tokens loaded');
}

// Clear tokens
tokenStorage.clearTokens();
```

### 3. Admin Security Middleware (`admin-security-middleware.ts`)

The Admin Security Middleware provides comprehensive security controls for admin operations.

**Features:**
- Admin identity validation
- Session ownership verification
- Authentication rate limiting with lockout
- Operation rate limiting
- Security event logging
- Audit trail export

**Usage Example:**

```typescript
import { AdminSecurityMiddleware, AdminOperation } from './admin-security-middleware';

// Initialize
const securityMiddleware = new AdminSecurityMiddleware(
  adminIdentityManager,
  sessionManager,
  {
    authAttemptsPerMinute: 5,
    authAttemptsPerHour: 20,
    operationsPerMinute: 60,
    operationsPerHour: 1000,
    lockoutDurationMs: 900000,  // 15 minutes
    lockoutThreshold: 10
  }
);

// Check authentication rate limit
const authResult = securityMiddleware.checkAuthRateLimit(ipAddress);
if (!authResult.valid) {
  console.error('Rate limit exceeded:', authResult.errorMessage);
  console.log('Retry after:', authResult.retryAfter, 'seconds');
  return;
}

// Record authentication failure
securityMiddleware.recordAuthFailure(ipAddress);

// Reset on successful authentication
securityMiddleware.resetAuthRateLimit(ipAddress);

// Validate admin operation
const context = {
  adminId: 'admin-123',
  username: 'john',
  operation: AdminOperation.END_SESSION,
  sessionId: 'session-456',
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0...',
  timestamp: new Date()
};

const operationResult = securityMiddleware.validateAdminOperation(context);
if (!operationResult.valid) {
  console.error('Operation validation failed:', operationResult.errorMessage);
  return;
}

// Get security statistics
const stats = securityMiddleware.getSecurityStatistics();
console.log('Security stats:', stats);

// Export audit log
const auditLog = securityMiddleware.exportAuditLog(
  new Date('2025-01-01'),
  new Date('2025-12-31')
);

// Cleanup
securityMiddleware.cleanup();
```

### 3. Integration with AdminIdentityManager

The AdminIdentityManager integrates with Cognito Authentication Service for token validation.

**Usage Example:**

```typescript
// Authenticate with credentials (generates Cognito tokens)
const result = await adminManager.authenticateWithCredentials(username, password, socketId);
console.log('Admin authenticated:', result.adminId);
console.log('Cognito tokens:', result.cognitoTokens);

// Authenticate with existing token (token validation)
try {
  const result = await adminManager.authenticateWithToken(accessToken, socketId);
  console.log('Token valid for admin:', result.adminId);
} catch (error) {
  console.error('Token validation failed:', error.message);
}

// Logout (clear admin connection)
adminManager.removeAdminConnection(socketId);
```

## Configuration

### Environment Variables

Add the following to your `.env` file:

```env
# Cognito Configuration (REQUIRED)
COGNITO_REGION=us-east-1                            # AWS region where User Pool is deployed
COGNITO_USER_POOL_ID=us-east-1_xxxxxx              # Cognito User Pool ID from CDK output
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx        # Cognito Client ID from CDK output

# Admin Rate Limiting Configuration
ADMIN_AUTH_RATE_LIMIT_PER_MINUTE=5
ADMIN_AUTH_RATE_LIMIT_PER_HOUR=20
ADMIN_OPERATION_RATE_LIMIT_PER_MINUTE=60
ADMIN_OPERATION_RATE_LIMIT_PER_HOUR=1000
ADMIN_LOCKOUT_DURATION_MS=900000                    # 15 minutes
ADMIN_LOCKOUT_THRESHOLD=10

# Security Logging
ENABLE_SECURITY_LOGGING=true
SECURITY_LOG_MAX_SIZE=10000
```

### Cognito User Pool Client Configuration

The Cognito User Pool Client must be configured with specific settings for the authentication flow to work:

**Required Configuration:**
- **Client Type**: Public client (no client secret)
- **Auth Flows**: 
  - ALLOW_USER_PASSWORD_AUTH (enabled)
  - ALLOW_REFRESH_TOKEN_AUTH (enabled)
- **Token Expiry**:
  - Access Token: 1 hour (default, configurable)
  - ID Token: 1 hour (default, configurable)
  - Refresh Token: 30 days (default, configurable)
- **Read/Write Attributes**: 
  - email (required)
  - preferred_username (required)

**Configuration via AWS CLI:**

```bash
aws cognito-idp update-user-pool-client \
  --user-pool-id us-east-1_xxxxxx \
  --client-id xxxxxxxxxxxxxxxxxxxxxxxxxx \
  --explicit-auth-flows USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH \
  --read-attributes email preferred_username \
  --write-attributes email preferred_username
```

**Configuration via CDK:**

```typescript
const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
  userPool: userPool,
  authFlows: {
    userPassword: true,
    custom: false,
    userSrp: false
  },
  generateSecret: false,  // Public client
  accessTokenValidity: Duration.hours(1),
  idTokenValidity: Duration.hours(1),
  refreshTokenValidity: Duration.days(30),
  readAttributes: new cognito.ClientAttributes()
    .withStandardAttributes({ email: true, preferredUsername: true }),
  writeAttributes: new cognito.ClientAttributes()
    .withStandardAttributes({ email: true, preferredUsername: true })
});
```

## Security Best Practices

### 1. Cognito User Pool Security

**Password Policy:**
- Minimum length: 12 characters (recommended)
- Require uppercase, lowercase, numbers, and special characters
- Password expiry: 90 days (optional)
- Prevent password reuse: Last 5 passwords

**Configuration via AWS Console:**
1. Navigate to Cognito User Pool
2. Go to "Policies" tab
3. Configure password requirements
4. Enable password expiry if needed

**Configuration via CDK:**

```typescript
const userPool = new cognito.UserPool(this, 'UserPool', {
  passwordPolicy: {
    minLength: 12,
    requireLowercase: true,
    requireUppercase: true,
    requireDigits: true,
    requireSymbols: true,
    tempPasswordValidity: Duration.days(3)
  },
  accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
  mfa: cognito.Mfa.OPTIONAL,  // Enable MFA for enhanced security
  mfaSecondFactor: {
    sms: true,
    otp: true
  }
});
```

**Multi-Factor Authentication (MFA):**
- Enable MFA for admin accounts (highly recommended)
- Support SMS and TOTP (Time-based One-Time Password)
- Require MFA for sensitive operations
- Configure MFA in Cognito User Pool settings

### 2. Token Security

**Token Expiry Configuration:**
- Access tokens: 1 hour (default, recommended)
- ID tokens: 1 hour (default, recommended)
- Refresh tokens: 30 days (default, configurable)
- Shorter expiry = more secure but more frequent refreshes
- Longer expiry = better UX but higher security risk

**Token Storage:**
- **Client-Side**: Encrypted using Electron safeStorage (Keychain/DPAPI)
- **Server-Side**: In-memory only (no persistence)
- **Never**: Store tokens in localStorage, sessionStorage, or cookies
- **Always**: Clear tokens on logout

**Token Refresh Strategy:**
- Automatic refresh every 5 minutes
- Refresh if less than 10 minutes remaining
- Use Cognito refresh token for new access token
- Handle refresh failures gracefully (re-authenticate)

### 3. Rate Limiting Configuration

**Recommendations:**
- Authentication: 5 attempts/minute, 20 attempts/hour
- Operations: 60 operations/minute, 1000 operations/hour
- Lockout: 15 minutes after 10 failed attempts
- Adjust based on legitimate usage patterns

**Monitoring:**
- Track rate limit violations
- Review locked accounts regularly
- Adjust limits if legitimate users affected
- Investigate suspicious patterns

### 4. Audit Logging

**Best Practices:**
- Enable security logging in production
- Export audit logs regularly for compliance
- Monitor for suspicious activity patterns
- Review authentication failures
- Track session ownership violations

**Log Retention:**
- In-memory: Last 10,000 events
- Export: Long-term storage as needed
- Compliance: Follow regulatory requirements

### 5. Session Management

**Session Cleanup:**
- User logout: Clear stored tokens and disconnect
- Password change: Re-authenticate with new credentials
- Security breach: Clear all tokens and disconnect all admin connections
- Admin account disabled: Handled by Cognito (user disabled in User Pool)
- Suspicious activity: Monitor via security middleware and audit logs

**Session Management Methods:**

```typescript
// Logout (clear tokens and disconnect)
tokenStorage.clearTokens();
adminManager.removeAdminConnection(socketId);

// Disconnect all admin connections (security breach)
const sockets = adminManager.getAdminSockets(adminId);
sockets.forEach(socketId => {
  io.to(socketId).emit('session-expired', { reason: 'security_breach' });
  io.sockets.sockets.get(socketId)?.disconnect(true);
});
```

## Security Event Types

### Authentication Events

- `AUTH_SUCCESS`: Successful authentication
- `AUTH_FAILURE`: Failed authentication attempt
- `AUTH_RATE_LIMITED`: Rate limit exceeded during auth
- `TOKEN_EXPIRED`: Token has expired
- `TOKEN_INVALID`: Invalid token signature or format
- `TOKEN_REFRESHED`: Token successfully refreshed

### Authorization Events

- `ACCESS_DENIED`: Unauthorized access attempt
- `UNAUTHORIZED_ACCESS`: Access without valid credentials
- `SESSION_OWNERSHIP_VIOLATION`: Attempt to modify unowned session

### Operation Events

- `OPERATION_SUCCESS`: Successful admin operation
- `OPERATION_FAILURE`: Failed admin operation
- `RATE_LIMIT_EXCEEDED`: Operation rate limit exceeded

### Security Events

- `SUSPICIOUS_ACTIVITY`: Multiple failed attempts or unusual behavior

## Error Codes

### Authentication Errors (1000-1099)

- `AUTH_1001`: Invalid credentials
- `AUTH_1002`: Token expired
- `AUTH_1003`: Token invalid
- `AUTH_1004`: Refresh token expired
- `AUTH_1005`: Refresh token invalid
- `AUTH_1006`: Session not found
- `AUTH_1007`: Rate limited
- `AUTH_1008`: Account locked

### Authorization Errors (1100-1199)

- `AUTHZ_1101`: Access denied
- `AUTHZ_1102`: Session not owned
- `AUTHZ_1103`: Insufficient permissions
- `AUTHZ_1104`: Operation not allowed

### System Errors (1400-1499)

- `SYSTEM_1401`: Internal error
- `SYSTEM_1402`: Database error
- `SYSTEM_1403`: Network error
- `SYSTEM_1404`: Rate limited
- `SYSTEM_1405`: Maintenance mode
- `SYSTEM_1406`: Connection limit exceeded

## Troubleshooting

### Token Validation Failures

**Symptoms:**
- Tokens rejected as invalid
- "Token expired" errors
- "Invalid token" errors from Cognito

**Solutions:**
1. Verify Cognito configuration (User Pool ID, Client ID, Region)
2. Check token hasn't expired
3. Ensure token was issued by the correct Cognito User Pool
4. Verify network connectivity to Cognito service
5. Check Cognito User Pool Client configuration

**Debug Steps:**

```typescript
// Validate token with Cognito
try {
  const userInfo = await cognitoAuth.validateToken(accessToken);
  console.log('Token valid for user:', userInfo);
} catch (error) {
  console.error('Token validation failed:', error);
  // Check error type for specific issues
}

// Check token storage
const tokens = tokenStorage.loadTokens();
console.log('Stored tokens:', tokens ? 'found' : 'not found');
console.log('Token expiry:', tokens?.expiresAt);
```

### Rate Limiting Issues

**Symptoms:**
- Users getting rate limited unexpectedly
- "Too many attempts" errors
- Legitimate users locked out

**Solutions:**
1. Review rate limit configuration
2. Check if multiple users share same IP (NAT/proxy)
3. Verify rate limit counters are resetting properly
4. Consider increasing limits for legitimate use cases
5. Check for automated scripts causing excessive requests

**Debug Commands:**

```typescript
// Get rate limit status
const status = securityMiddleware.getRateLimitStatus(identifier);
console.log('Rate limit status:', status);

// Get security statistics
const stats = securityMiddleware.getSecurityStatistics();
console.log('Locked accounts:', stats.lockedAccounts);
```

### Authentication Lockouts

**Symptoms:**
- Users locked out after failed attempts
- "Account locked" errors
- Cannot authenticate even with correct credentials

**Solutions:**
1. Verify lockout threshold is appropriate
2. Check if IP address is correct (proxy/NAT issues)
3. Review security logs for failed attempts
4. Manually clear lockout if needed
5. Educate users on correct credentials

**Manual Lockout Clear:**

```typescript
// Reset authentication rate limit
securityMiddleware.resetAuthRateLimit(ipAddress);
```

### Session Ownership Violations

**Symptoms:**
- Admins can't access their own sessions
- "Session not owned" errors
- Ownership checks failing incorrectly

**Solutions:**
1. Verify admin identity is correctly registered
2. Check session was created with correct admin ID
3. Review session ownership in session files
4. Ensure token contains correct admin ID
5. Check for token version mismatches

**Debug Commands:**

```typescript
// Verify session ownership
const isOwner = adminManager.verifySessionOwnership(adminId, sessionId);
console.log('Admin owns session:', isOwner);

// Get admin's sessions
const sessionIds = adminManager.getAdminSessionIds(adminId);
console.log('Admin sessions:', sessionIds);
```

## Migration Guide

### Breaking Changes - Cognito Authentication Only

**IMPORTANT**: This system uses **AWS Cognito authentication only**. No local JWT or basic authentication is supported.

### Setting Up Cognito Authentication

1. **Deploy CDK Stack:**
   ```bash
   cd src/backend
   npm run deploy
   ```
   This creates the Cognito User Pool and outputs configuration values.

2. **Update Environment Configuration:**
   ```bash
   # Add Cognito configuration to .env
   COGNITO_REGION=us-east-1
   COGNITO_USER_POOL_ID=us-east-1_xxxxxx
   COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

3. **Run Setup Script:**
   ```bash
   ./setup-unified-auth.sh
   ```
   This script guides you through the setup process.

4. **Restart Server:**
   ```bash
   cd src/websocket-server
   npm start
   ```

### Breaking Changes

- **JWT authentication removed**: All JWT-related code has been removed
- **Cognito required**: AWS Cognito User Pool is now mandatory
- **Token format changed**: Cognito issues JWTs with different claims structure
- **Setup scripts changed**: Old setup scripts (`setup-admin.sh`, `setup-tts.sh`) removed

### Optional Enhancements

1. **Adjust Rate Limits:**
   ```env
   ADMIN_AUTH_RATE_LIMIT_PER_MINUTE=10  # Increase if needed
   ```

2. **Export Audit Logs:**
   ```typescript
   // Schedule regular audit log exports
   setInterval(() => {
     const logs = securityMiddleware.exportAuditLog();
     fs.writeFileSync('audit-log.json', JSON.stringify(logs, null, 2));
   }, 24 * 60 * 60 * 1000);  // Daily
   ```

## Testing

### Unit Tests

Test Cognito authentication:

```typescript
describe('CognitoAuthService', () => {
  it('should authenticate user with credentials', async () => {
    const result = await cognitoAuth.authenticateUser(username, password);
    expect(result.accessToken).toBeDefined();
    expect(result.idToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
  });

  it('should validate access token', async () => {
    const userInfo = await cognitoAuth.validateToken(accessToken);
    expect(userInfo.sub).toBeDefined();
    expect(userInfo.email).toBeDefined();
  });

  it('should refresh access token', async () => {
    const result = await cognitoAuth.refreshAccessToken(username, refreshToken);
    expect(result.accessToken).toBeDefined();
    expect(result.expiresIn).toBeGreaterThan(0);
  });
});
```

Test token storage:

```typescript
describe('SecureTokenStorage', () => {
  it('should store and retrieve tokens', () => {
    const tokens = {
      accessToken: 'test-access-token',
      idToken: 'test-id-token',
      refreshToken: 'test-refresh-token',
      expiresAt: new Date(Date.now() + 3600000),
      username: 'testuser'
    };
    
    tokenStorage.storeTokens(tokens);
    const retrieved = tokenStorage.loadTokens();
    
    expect(retrieved).toBeDefined();
    expect(retrieved?.username).toBe('testuser');
  });

  it('should clear tokens', () => {
    tokenStorage.clearTokens();
    const tokens = tokenStorage.loadTokens();
    expect(tokens).toBeNull();
  });
});
```

### Integration Tests

Test security middleware:

```typescript
describe('AdminSecurityMiddleware', () => {
  it('should enforce rate limits', () => {
    // Exceed rate limit
    for (let i = 0; i < 10; i++) {
      securityMiddleware.checkAuthRateLimit(ipAddress);
    }
    const result = securityMiddleware.checkAuthRateLimit(ipAddress);
    expect(result.valid).toBe(false);
  });

  it('should verify session ownership', () => {
    const result = securityMiddleware.verifySessionOwnership(
      adminId,
      sessionId,
      AdminOperation.END_SESSION
    );
    expect(result.valid).toBe(true);
  });
});
```

Test admin identity manager with Cognito:

```typescript
describe('AdminIdentityManager with Cognito', () => {
  it('should authenticate admin with credentials', async () => {
    const result = await adminManager.authenticateWithCredentials(
      username,
      password,
      socketId
    );
    expect(result.adminId).toBeDefined();
    expect(result.cognitoTokens).toBeDefined();
  });

  it('should authenticate admin with token', async () => {
    const result = await adminManager.authenticateWithToken(accessToken, socketId);
    expect(result.adminId).toBeDefined();
    expect(result.ownedSessions).toBeDefined();
  });
});
```

## Support

For security issues or questions:
1. Review this documentation
2. Check troubleshooting section
3. Review security event logs
4. Contact security team if needed

**Security Disclosure:**
If you discover a security vulnerability, please report it privately to the security team.
