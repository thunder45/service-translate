# Service Translate - Security Guide

This guide covers security features, best practices, and configuration for Service Translate deployments.

## Table of Contents

1. [Security Overview](#security-overview)
2. [Authentication](#authentication)
3. [Session Security](#session-security)
4. [Rate Limiting](#rate-limiting)
5. [Network Security](#network-security)
6. [Deployment Security](#deployment-security)
7. [Monitoring and Auditing](#monitoring-and-auditing)
8. [Best Practices](#best-practices)

## Security Overview

Service Translate implements multiple layers of security:

- **Authentication**: Optional basic authentication for admin access
- **Session Security**: Secure session ID generation and validation
- **Rate Limiting**: Protection against abuse and DoS attacks
- **Network Security**: CORS configuration and IP-based controls
- **Input Validation**: Message validation and sanitization
- **Audit Logging**: Comprehensive security event logging

## Authentication

### AWS Cognito Authentication (Current System)

Service Translate uses **AWS Cognito** for unified authentication. Authentication is **always enabled** and required.

```env
# Cognito Configuration (REQUIRED)
COGNITO_REGION=us-east-1
COGNITO_USER_POOL_ID=us-east-1_xxxxxx
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx

# Token Configuration
# Access Token: 1 hour (configurable in Cognito)
# ID Token: 1 hour (configurable in Cognito)  
# Refresh Token: 30 days (configurable in Cognito)
```

### Cognito User Pool Requirements

Your Cognito User Pool Client must be configured with:

- **Client Type**: Public client (no secret)
- **Auth Flows**: 
  - `ALLOW_USER_PASSWORD_AUTH` ✅ Required
  - `ALLOW_REFRESH_TOKEN_AUTH` ✅ Required
- **Token Expiry**:
  - Access Token: 60 minutes (recommended)
  - ID Token: 60 minutes (recommended)
  - Refresh Token: 43200 minutes (30 days)

### Password Security

Cognito manages password policies. Configure in AWS Console:
- Minimum password length: 8+ characters
- Require uppercase letters
- Require lowercase letters  
- Require numbers
- Require special characters
- Password history: 12 previous passwords
- Temporary password validity: 7 days

### User Management

Create admin users in Cognito User Pool:

```bash
# Create admin user
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_xxxxxx \
  --username admin@example.com \
  --user-attributes Name=email,Value=admin@example.com \
  --temporary-password TempPassword123!

# Set permanent password (user will be prompted on first login)
aws cognito-idp admin-set-user-password \
  --user-pool-id us-east-1_xxxxxx \
  --username admin@example.com \
  --password SecurePassword123! \
  --permanent
```

**Note**: All users in the Cognito User Pool have admin access to WebSocket server.

## Session Security

### Session ID Formats

Service Translate supports two session ID formats:

#### Basic Format (Default)
- Human-readable: `CHURCH-2025-001`
- Easy to communicate verbally
- Suitable for local deployments

#### Secure Format
- Cryptographically signed
- Tamper-resistant
- Recommended for network/cloud deployments

### Configuration

```env
# Enable secure session IDs
SECURE_SESSION_IDS=true

# Session secret key (required for secure IDs)
SESSION_SECRET=your-32-character-secret-key-here

# Session ID prefix
SESSION_ID_PREFIX=CHURCH

# Session timeout (in minutes)
SESSION_TIMEOUT_MINUTES=480  # 8 hours
```

### Session Validation

Secure sessions include:
- Cryptographic signature
- Expiration timestamp
- Admin metadata
- IP address binding (optional)

## Rate Limiting

### WebSocket Rate Limiting

Protects against message flooding:

```env
# Messages per second per client
WEBSOCKET_RATE_LIMIT_PER_SECOND=10
```

### Polly API Rate Limiting

Prevents TTS API abuse:

```env
# Polly requests per minute per client
POLLY_RATE_LIMIT_PER_MINUTE=60
```

### Session Client Limits

Controls concurrent connections:

```env
# Maximum clients per session
MAX_CLIENTS_PER_SESSION=50
```

### Rate Limit Responses

When limits are exceeded:
- Client receives rate limit notification
- Temporary blocking (1-5 minutes)
- Automatic unblocking after cooldown
- Security event logging

## Network Security

### CORS Configuration

Control cross-origin access:

```env
# Local development (permissive)
WEBSOCKET_CORS_ORIGIN=*

# Network deployment (restrictive)
WEBSOCKET_CORS_ORIGIN=http://192.168.1.0/24

# Cloud deployment (specific domains)
WEBSOCKET_CORS_ORIGIN=https://yourdomain.com,https://app.yourdomain.com
```

### Firewall Configuration

#### Windows Firewall
```cmd
# Allow WebSocket and PWA client ports (configurable)
netsh advfirewall firewall add rule name="Service Translate WebSocket" dir=in action=allow protocol=TCP localport=3001
netsh advfirewall firewall add rule name="Service Translate PWA" dir=in action=allow protocol=TCP localport=8080

# For custom ports, update port numbers accordingly:
# WS_PORT=4001 PWA_PORT=9090
```

#### Linux (UFW)
```bash
# Allow specific ports (default: WebSocket 3001, PWA 8080)
sudo ufw allow 3001/tcp  # WebSocket server
sudo ufw allow 8080/tcp  # PWA client server

# Allow from specific network only
sudo ufw allow from 192.168.1.0/24 to any port 3001
sudo ufw allow from 192.168.1.0/24 to any port 8080
```

#### macOS
```bash
# Add firewall rules through System Preferences
# Security & Privacy > Firewall > Firewall Options
# Add Service Translate applications
```

## Deployment Security

### Local Deployment

Minimal security requirements:
- Authentication: Optional
- Session IDs: Basic format acceptable
- Network: Local network only
- Monitoring: Basic logging

```env
DEPLOYMENT_MODE=local
ENABLE_AUTH=false
SECURE_SESSION_IDS=false
WEBSOCKET_CORS_ORIGIN=*
```

### Network Deployment

Enhanced security for LAN access:
- Authentication: Recommended
- Session IDs: Secure format recommended
- Network: Restricted CORS
- Monitoring: Enhanced logging

```env
DEPLOYMENT_MODE=network
ENABLE_AUTH=true
SECURE_SESSION_IDS=true
WEBSOCKET_CORS_ORIGIN=http://192.168.1.0/24
```

### Cloud Deployment

Maximum security for internet access:
- Authentication: Required
- Session IDs: Secure format required
- Network: Strict CORS policy
- Monitoring: Full audit logging
- HTTPS: Recommended (requires reverse proxy)

```env
DEPLOYMENT_MODE=cloud
ENABLE_AUTH=true
SECURE_SESSION_IDS=true
WEBSOCKET_CORS_ORIGIN=https://yourdomain.com
```

## Monitoring and Auditing

### Security Events

The system logs these security events:
- Connection attempts (success/failure)
- Authentication events
- Rate limit violations
- Session creation/validation
- Client blocking/unblocking
- Configuration changes

### Log Locations

```
logs/service-translate.log    # Main application log
logs/security.log           # Security-specific events
SECURITY_AUDIT_REPORT.md    # Periodic audit reports
```

### Security Endpoints

Monitor security status via HTTP endpoints (WebSocket server):

```bash
# Overall health including security stats
curl http://localhost:3001/health

# Detailed security statistics
curl http://localhost:3001/security

# Performance metrics
curl http://localhost:3001/metrics
```

### Manual Security Checks

Regular security verification:

```bash
# Check npm vulnerabilities
npm audit
npm audit fix

# Verify Cognito configuration
grep -E "COGNITO_" src/websocket-server/.env

# Test authentication flow
# (Use capture app to test login/logout)
```

## Best Practices

### Credential Management

1. **Never commit credentials to version control**
   ```bash
   # Add to .gitignore
   echo ".env" >> .gitignore
   echo "*.key" >> .gitignore
   echo "*.pem" >> .gitignore
   ```

2. **Use environment-specific configurations**
   ```bash
   # Development
   cp .env.example .env.development
   
   # Production
   cp .env.example .env.production
   ```

3. **Rotate credentials regularly**
   - Change passwords every 90 days
   - Regenerate session secrets monthly
   - Update AWS access keys as needed

### Network Security

1. **Use dedicated networks**
   - Separate WiFi network for translation service
   - VLAN isolation for sensitive deployments
   - Guest network isolation

2. **Monitor network traffic**
   - Log connection attempts
   - Monitor for unusual patterns
   - Alert on failed authentication attempts

3. **Regular updates**
   - Keep Node.js updated
   - Update npm dependencies
   - Apply security patches promptly

### Operational Security

1. **Principle of least privilege**
   - Minimal AWS permissions
   - Restricted file system access
   - Limited network exposure

2. **Regular backups**
   - Configuration files
   - Session data (if persistent)
   - Security logs

3. **Incident response**
   - Monitor security logs
   - Have rollback procedures
   - Document security incidents

### AWS Security

1. **IAM Best Practices**
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "polly:SynthesizeSpeech",
           "polly:DescribeVoices",
           "transcribe:StartStreamTranscription",
           "translate:TranslateText"
         ],
         "Resource": "*"
       }
     ]
   }
   ```

2. **Cost Controls**
   - Set billing alerts
   - Monitor usage patterns
   - Implement rate limiting

3. **Access Logging**
   - Enable CloudTrail
   - Monitor API usage
   - Alert on unusual activity

## Security Checklist

### Pre-Deployment

- [ ] Run security audit: `npm run security:audit`
- [ ] Generate secure credentials: `npm run security:generate`
- [ ] Configure appropriate authentication
- [ ] Set up proper CORS policy
- [ ] Configure rate limiting
- [ ] Test firewall rules
- [ ] Verify file permissions
- [ ] Review AWS permissions

### Post-Deployment

- [ ] Monitor security logs
- [ ] Test authentication flows
- [ ] Verify rate limiting works
- [ ] Check session security
- [ ] Monitor resource usage
- [ ] Regular security audits
- [ ] Update documentation

### Ongoing Maintenance

- [ ] Weekly log reviews
- [ ] Monthly security audits
- [ ] Quarterly credential rotation
- [ ] Annual security assessment
- [ ] Dependency updates
- [ ] Security training for operators

## Troubleshooting Security Issues

### Cognito Authentication Problems

```bash
# Check Cognito configuration
grep -E "COGNITO_" src/websocket-server/.env

# Verify Cognito User Pool exists
aws cognito-idp describe-user-pool \
  --user-pool-id us-east-1_xxxxxx \
  --region us-east-1

# Test Cognito user login (use capture app)
cd src/capture && npm run dev
```

### Rate Limiting Issues

```bash  
# Check rate limit status
curl http://localhost:3001/security

# Reset rate limits by restarting WebSocket server
cd src/websocket-server && npm start
```

### Session Problems

```bash
# Validate basic session format
node -e "console.log(/^CHURCH-\d{4}-\d{3}$/.test('CHURCH-2025-001'))"

# Check WebSocket server session management
curl http://localhost:3001/health
```

### Network Connectivity

```bash
# Test WebSocket server connection
curl http://localhost:3001/health

# Test PWA client server
curl http://localhost:8080

# Test WebSocket protocol (if wscat installed)
# wscat -c ws://localhost:3001
```

## Security Updates

Stay informed about security updates:

1. **Monitor dependencies**
   ```bash
   npm audit
   npm audit fix
   ```

2. **Subscribe to security advisories**
   - Node.js security releases
   - npm security advisories
   - AWS security bulletins

3. **Regular security reviews**
   - Code security analysis
   - Configuration reviews
   - Penetration testing (for production)

---

For additional security questions or to report security issues, please follow responsible disclosure practices and contact the development team through appropriate channels.
