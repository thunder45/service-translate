# Admin Security Implementation Guide

## Overview

This document provides a comprehensive guide to the admin security implementation, including JWT token security, rate limiting, audit logging, and best practices.

## Components

### 1. JWT Security Manager (`jwt-security.ts`)

The JWT Security Manager handles all JWT token operations with security best practices.

**Features:**
- Secure token generation with cryptographic JWT IDs
- Comprehensive token validation with multiple checks
- Token revocation and blacklist management
- Automatic blacklist cleanup
- Secret rotation warnings
- File-based persistent blacklist

**Usage Example:**

```typescript
import { JWTSecurityManager, JWTSecurityConfig } from './jwt-security';

// Initialize
const config: JWTSecurityConfig = {
  secret: process.env.JWT_SECRET || JWTSecurityManager.generateSecret(),
  algorithm: 'HS256',
  issuer: 'service-translate-ws',
  audience: 'service-translate-admin',
  accessTokenExpiry: '1h',
  refreshTokenExpiry: '30d',
  rotationPolicy: {
    enabled: false,
    intervalDays: 90
  },
  blacklistEnabled: true,
  blacklistCleanupIntervalMs: 3600000
};

const jwtSecurity = new JWTSecurityManager(config, './data');

// Generate tokens
const accessToken = jwtSecurity.generateAccessToken(adminId, username, tokenVersion);
const refreshToken = jwtSecurity.generateRefreshToken(adminId, username, tokenVersion);

// Validate token
const result = jwtSecurity.validateToken(token);
if (result.valid) {
  console.log('Token is valid:', result.payload);
} else {
  console.error('Token validation failed:', result.error, result.errorCode);
}

// Revoke token
jwtSecurity.revokeToken(token, 'User requested logout');

// Check if token is blacklisted
const isRevoked = jwtSecurity.isTokenBlacklisted(jti);

// Get blacklist statistics
const stats = jwtSecurity.getBlacklistStats();
console.log('Blacklist stats:', stats);

// Cleanup
jwtSecurity.cleanup();
```

### 2. Admin Security Middleware (`admin-security-middleware.ts`)

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

The AdminIdentityManager has been updated to use the JWT Security Manager.

**Changes:**
- Uses `JWTSecurityManager` for token generation and validation
- Supports token revocation through JWT security layer
- Maintains backward compatibility with existing token management

**Usage Example:**

```typescript
// Generate token pair (now uses JWT Security Manager internally)
const tokens = adminManager.generateTokenPair(adminId);

// Validate token (now uses JWT Security Manager internally)
try {
  const payload = adminManager.validateAccessToken(token);
  console.log('Token valid for admin:', payload.adminId);
} catch (error) {
  console.error('Token validation failed:', error.message);
}

// Revoke token
adminManager.revokeToken(token, 'User requested logout');

// Access JWT security manager for advanced operations
const jwtSecurity = adminManager.getJWTSecurity();
const stats = jwtSecurity.getBlacklistStats();
```

## Configuration

### Environment Variables

Add the following to your `.env` file:

```env
# JWT Security Configuration
JWT_SECRET=                                         # Auto-generated if not set
JWT_ALGORITHM=HS256                                 # HS256, HS384, or HS512
JWT_ISSUER=service-translate-ws
JWT_AUDIENCE=service-translate-admin
JWT_ACCESS_TOKEN_EXPIRY=1h                          # 1 hour
JWT_REFRESH_TOKEN_EXPIRY=30d                        # 30 days
JWT_ENABLE_BLACKLIST=true
JWT_BLACKLIST_CLEANUP_INTERVAL_MS=3600000           # 1 hour
JWT_SECRET_ROTATION_ENABLED=false
JWT_SECRET_ROTATION_INTERVAL_DAYS=90

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

### Generating JWT Secret

On first startup, if `JWT_SECRET` is not set, the system will auto-generate a secure secret. To manually generate a secret:

```typescript
import { JWTSecurityManager } from './jwt-security';

const secret = JWTSecurityManager.generateSecret();
console.log('Generated JWT secret:', secret);
```

Or using Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Security Best Practices

### 1. JWT Secret Management

**DO:**
- Use auto-generated secrets (64 hex characters minimum)
- Store secrets in `.env` file with restricted permissions (chmod 600)
- Rotate secrets every 90 days
- Keep backup of secrets in secure location
- Use different secrets for different environments

**DON'T:**
- Commit secrets to version control
- Share secrets via insecure channels
- Use weak or predictable secrets
- Reuse secrets across applications

### 2. Token Expiry Configuration

**Recommendations:**
- Access tokens: 15 minutes to 1 hour
- Refresh tokens: 7 to 30 days
- Shorter expiry = more secure but more frequent refreshes
- Longer expiry = better UX but higher security risk

**Configuration Examples:**

```env
# High security (frequent refreshes)
JWT_ACCESS_TOKEN_EXPIRY=15m
JWT_REFRESH_TOKEN_EXPIRY=7d

# Balanced (recommended)
JWT_ACCESS_TOKEN_EXPIRY=1h
JWT_REFRESH_TOKEN_EXPIRY=30d

# Convenience (less secure)
JWT_ACCESS_TOKEN_EXPIRY=4h
JWT_REFRESH_TOKEN_EXPIRY=90d
```

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

### 5. Token Revocation

**When to Revoke:**
- User logout
- Password change
- Security breach detected
- Admin account disabled
- Suspicious activity detected

**Revocation Methods:**

```typescript
// Revoke specific token
jwtSecurity.revokeToken(token, 'User logout');

// Revoke all tokens for admin (increment version)
adminManager.invalidateAllTokens(adminId);
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
- "Invalid signature" errors
- "Token expired" errors

**Solutions:**
1. Verify JWT secret is correctly configured
2. Check token hasn't expired (decode and check `exp` claim)
3. Ensure token version matches admin's current version
4. Check if token has been revoked/blacklisted
5. Verify issuer and audience claims match configuration

**Debug Commands:**

```typescript
// Decode token without validation
const payload = jwtSecurity.decodeToken(token);
console.log('Token payload:', payload);

// Check token expiry
const expiry = jwtSecurity.getTokenExpiry(token);
console.log('Token expires at:', expiry);

// Check if blacklisted
const isBlacklisted = jwtSecurity.isTokenBlacklisted(payload.jti);
console.log('Is blacklisted:', isBlacklisted);
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

### Updating Existing Deployments

1. **Update Environment Configuration:**
   ```bash
   # Add new JWT security variables to .env
   JWT_SECRET=  # Will be auto-generated
   JWT_ENABLE_BLACKLIST=true
   # ... (see Configuration section)
   ```

2. **Create Data Directory:**
   ```bash
   mkdir -p ./data
   chmod 700 ./data
   ```

3. **Update Server Initialization:**
   ```typescript
   // Update AdminIdentityManager initialization
   const adminManager = new AdminIdentityManager(
     adminStore,
     jwtConfig,
     './data'  // Add data directory parameter
   );
   ```

4. **Initialize Security Middleware:**
   ```typescript
   const securityMiddleware = new AdminSecurityMiddleware(
     adminIdentityManager,
     sessionManager,
     rateLimitConfig
   );
   ```

5. **Restart Server:**
   - JWT secret will be auto-generated on first run
   - Blacklist file will be created
   - All existing tokens will remain valid

### Breaking Changes

**None** - The implementation is backward compatible with existing token management.

### Optional Enhancements

1. **Enable Secret Rotation Warnings:**
   ```env
   JWT_SECRET_ROTATION_ENABLED=true
   JWT_SECRET_ROTATION_INTERVAL_DAYS=90
   ```

2. **Adjust Rate Limits:**
   ```env
   ADMIN_AUTH_RATE_LIMIT_PER_MINUTE=10  # Increase if needed
   ```

3. **Export Audit Logs:**
   ```typescript
   // Schedule regular audit log exports
   setInterval(() => {
     const logs = securityMiddleware.exportAuditLog();
     fs.writeFileSync('audit-log.json', JSON.stringify(logs, null, 2));
   }, 24 * 60 * 60 * 1000);  // Daily
   ```

## Testing

### Unit Tests

Test JWT security operations:

```typescript
describe('JWTSecurityManager', () => {
  it('should generate valid tokens', () => {
    const token = jwtSecurity.generateAccessToken(adminId, username, 1);
    const result = jwtSecurity.validateToken(token);
    expect(result.valid).toBe(true);
  });

  it('should revoke tokens', () => {
    const token = jwtSecurity.generateAccessToken(adminId, username, 1);
    jwtSecurity.revokeToken(token);
    const result = jwtSecurity.validateToken(token);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('TOKEN_REVOKED');
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

## Support

For security issues or questions:
1. Review this documentation
2. Check troubleshooting section
3. Review security event logs
4. Contact security team if needed

**Security Disclosure:**
If you discover a security vulnerability, please report it privately to the security team.
