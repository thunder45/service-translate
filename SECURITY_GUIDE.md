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

### Configuration

Authentication is controlled by environment variables:

```env
# Enable/disable authentication
ENABLE_AUTH=false

# Authentication credentials (required if ENABLE_AUTH=true)
AUTH_USERNAME=admin
AUTH_PASSWORD=your-secure-password-here

# Session timeout (in milliseconds)
AUTH_SESSION_TIMEOUT=86400000  # 24 hours
```

### Password Requirements

For secure deployments, passwords should:
- Be at least 8 characters long
- Include uppercase and lowercase letters
- Include numbers
- Include special characters
- Not be dictionary words or common patterns

### Generating Secure Credentials

Use the built-in credential generator:

```bash
npm run security:generate
```

This generates:
- Strong session secret
- Secure authentication credentials
- Proper configuration format

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
# Allow WebSocket and HTTP ports
netsh advfirewall firewall add rule name="Service Translate WebSocket" dir=in action=allow protocol=TCP localport=3001
netsh advfirewall firewall add rule name="Service Translate HTTP" dir=in action=allow protocol=TCP localport=3000
```

#### Linux (UFW)
```bash
# Allow specific ports
sudo ufw allow 3000/tcp
sudo ufw allow 3001/tcp

# Allow from specific network only
sudo ufw allow from 192.168.1.0/24 to any port 3000
sudo ufw allow from 192.168.1.0/24 to any port 3001
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

Monitor security status via HTTP endpoints:

```bash
# Overall health including security stats
curl http://localhost:3000/health

# Detailed security statistics
curl http://localhost:3000/security

# Performance metrics
curl http://localhost:3000/metrics
```

### Running Security Audits

Regular security audits:

```bash
# Run comprehensive security audit
npm run security:audit

# Check specific security aspects
npm run maintenance:stats
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

### Authentication Problems

```bash
# Check authentication configuration
grep -E "ENABLE_AUTH|AUTH_" .env

# Test authentication endpoint
curl -X POST http://localhost:3000/auth \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}'
```

### Rate Limiting Issues

```bash
# Check rate limit status
curl http://localhost:3000/security

# Reset rate limits (restart server)
npm run start:server
```

### Session Problems

```bash
# Validate session format
node -e "console.log(/^CHURCH-\d{4}-\d{3}$/.test('CHURCH-2025-001'))"

# Check session security settings
grep -E "SESSION_|SECURE_" .env
```

### Network Connectivity

```bash
# Test WebSocket connection
wscat -c ws://localhost:3001

# Test HTTP endpoints
curl http://localhost:3000/health
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