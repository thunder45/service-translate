# Cognito Authentication Setup Guide

This guide explains how to configure AWS Cognito authentication for the WebSocket server.

## Overview

The WebSocket server uses AWS Cognito for admin authentication, replacing the previous local credential system. This provides centralized user management, secure token handling, and integration with AWS services.

## Prerequisites

1. **AWS Account**: Active AWS account with permissions to create Cognito resources
2. **CDK Deployment**: Backend CDK stack must be deployed first
3. **Node.js**: Version 16 or higher

## Cognito User Pool Client Configuration Requirements

The Cognito User Pool Client **MUST** be configured with the following settings:

### Client Type
- **Type**: Public client (no secret)
- **Reason**: The WebSocket server uses `amazon-cognito-identity-js` which requires a public client

### Authentication Flows
The following auth flows **MUST** be enabled:
- ✅ `ALLOW_USER_PASSWORD_AUTH` - Required for username/password authentication
- ✅ `ALLOW_REFRESH_TOKEN_AUTH` - Required for token refresh

### Token Expiration Settings
Recommended token expiry times:
- **Access Token**: 1 hour (default)
- **ID Token**: 1 hour (default)
- **Refresh Token**: 30 days (default)

### Read/Write Attributes
Minimum required attributes:
- ✅ `email` - User email address
- ✅ `preferred_username` - Username for display

### Additional Settings
- **Prevent User Existence Errors**: Enabled (recommended for security)
- **Enable Token Revocation**: Enabled (recommended)

## Environment Configuration

### Required Environment Variables

Add these variables to `src/websocket-server/.env`:

```bash
# Cognito Authentication Configuration (REQUIRED)
COGNITO_REGION=us-east-1                            # AWS region where Cognito User Pool is deployed
COGNITO_USER_POOL_ID=us-east-1_xxxxxx              # Cognito User Pool ID
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx        # Cognito User Pool Client ID
```

**Note**: The WebSocket server now uses **WS_PORT** instead of PORT for consistency with other components.

### Getting Configuration Values

#### Option 1: From CDK Deployment Output

After deploying the backend CDK stack, the Cognito configuration is output:

```bash
cd src/backend
npm run deploy

# Look for output like:
# Outputs:
# ServiceTranslateStack.CognitoUserPoolId = us-east-1_xxxxxx
# ServiceTranslateStack.CognitoClientId = xxxxxxxxxxxxxxxxxxxxxxxxxx
# ServiceTranslateStack.CognitoRegion = us-east-1
```

#### Option 2: From AWS Console

1. Navigate to AWS Cognito Console
2. Select your User Pool
3. Copy the **Pool Id** (e.g., `us-east-1_xxxxxx`)
4. Go to **App Integration** → **App clients**
5. Copy the **Client ID** (e.g., `xxxxxxxxxxxxxxxxxxxxxxxxxx`)
6. Note the **Region** from the Pool Id prefix

#### Option 3: Using AWS CLI

```bash
# List User Pools
aws cognito-idp list-user-pools --max-results 10

# Get User Pool details
aws cognito-idp describe-user-pool --user-pool-id us-east-1_xxxxxx

# List User Pool Clients
aws cognito-idp list-user-pool-clients --user-pool-id us-east-1_xxxxxx

# Get Client details
aws cognito-idp describe-user-pool-client \
  --user-pool-id us-east-1_xxxxxx \
  --client-id xxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Server Startup Validation

The WebSocket server validates Cognito configuration on startup and will **fail fast** if any required variables are missing.

### Successful Startup

```
✓ Cognito configuration validated
  Region: us-east-1
  User Pool ID: us-east-1_xxxxxx
  Client ID: xxxxxxxxxxxxxxxxxxxxxxxxxx

Service Translate WebSocket Server running on port 3001
```

### Failed Startup (Missing Configuration)

```
========================================
COGNITO CONFIGURATION ERROR
========================================

Missing required Cognito environment variables:
  - COGNITO_USER_POOL_ID
  - COGNITO_CLIENT_ID

These values are obtained from the CDK deployment output.

Setup Instructions:
  1. Deploy the backend CDK stack:
     cd src/backend && npm run deploy

  2. Copy the Cognito values from CDK output to .env:
     COGNITO_REGION=us-east-1
     COGNITO_USER_POOL_ID=us-east-1_xxxxxx
     COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx

  3. Ensure User Pool Client is configured as:
     - Client Type: Public client (no secret)
     - Auth Flows: ALLOW_USER_PASSWORD_AUTH, ALLOW_REFRESH_TOKEN_AUTH

========================================
```

## Creating Cognito Users

### Option 1: AWS Console

1. Navigate to AWS Cognito Console
2. Select your User Pool
3. Go to **Users** → **Create user**
4. Enter email and temporary password
5. User will be prompted to change password on first login

### Option 2: AWS CLI

```bash
# Create user with temporary password
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_xxxxxx \
  --username admin@example.com \
  --user-attributes Name=email,Value=admin@example.com \
  --temporary-password TempPassword123!

# Set permanent password (optional)
aws cognito-idp admin-set-user-password \
  --user-pool-id us-east-1_xxxxxx \
  --username admin@example.com \
  --password SecurePassword123! \
  --permanent
```

### Option 3: Setup Script (Coming Soon)

A unified setup script will be provided to automate Cognito user creation:

```bash
./setup-unified-auth.sh
```

## Authentication Flow

### Initial Authentication

1. Capture app sends credentials to WebSocket server:
   ```json
   {
     "type": "admin-auth",
     "method": "credentials",
     "username": "admin@example.com",
     "password": "SecurePassword123!"
   }
   ```

2. Server validates credentials with Cognito using `amazon-cognito-identity-js`

3. Server returns Cognito tokens:
   ```json
   {
     "success": true,
     "adminId": "cognito-sub-uuid",
     "accessToken": "eyJraWQiOiJ...",
     "idToken": "eyJraWQiOiJ...",
     "refreshToken": "eyJjdHkiOiJ...",
     "expiresIn": 3600,
     "ownedSessions": ["SESSION-001"]
   }
   ```

4. Capture app stores tokens securely using Electron `safeStorage`

### Token Refresh

1. Capture app checks token expiry every 5 minutes
2. If less than 10 minutes remaining, automatically refresh:
   ```json
   {
     "type": "token-refresh",
     "refreshToken": "eyJjdHkiOiJ..."
   }
   ```

3. Server validates refresh token with Cognito
4. Server returns new access token

### Reconnection

1. Capture app reconnects with stored access token
2. Server validates token with Cognito
3. Server recovers admin's owned sessions
4. Connection restored without re-authentication

## Token Storage

### Server (In-Memory Only)

- Access tokens stored in memory only
- No token persistence on server
- All tokens lost on server restart
- Admins must re-authenticate after restart

**Rationale**: Simplicity over persistence. Tokens expire anyway, and requiring re-authentication on server restart is acceptable.

### Capture App (Encrypted File Storage)

- Tokens stored in encrypted file using Electron `safeStorage`
- File location: `{appDataPath}/cognito-tokens.enc`
- Tokens persist across app restarts
- Tokens cleared on logout

**Rationale**: Better UX with secure storage.

## Security Considerations

### Token Security

1. **Access Tokens**: Short-lived (1 hour)
   - Used for API authentication
   - Automatically refreshed before expiry
   - Stored in memory on server

2. **Refresh Tokens**: Long-lived (30 days)
   - Used to obtain new access tokens
   - Stored encrypted on client
   - Single-use and rotated on refresh

3. **ID Tokens**: Short-lived (1 hour)
   - Contains user information
   - Used for user identity verification

### Network Security

- Use WSS (encrypted WebSocket) in production
- Validate tokens server-side on every operation
- Rate limit authentication attempts
- Log all authentication events

### User Management

- Use strong password policies in Cognito
- Enable MFA for admin accounts (recommended)
- Regularly review and audit user access
- Disable unused accounts

## Troubleshooting

### Server Won't Start

**Error**: Missing Cognito configuration

**Solution**:
1. Verify `.env` file exists in `src/websocket-server/`
2. Check all three required variables are set
3. Verify values are correct (no extra spaces)

### Authentication Fails

**Error**: `NotAuthorizedException: Incorrect username or password`

**Solution**:
1. Verify user exists in Cognito User Pool
2. Check username/email is correct
3. Verify password is correct
4. Check if user account is enabled

### Token Validation Fails

**Error**: `TokenExpiredException: Access Token has expired`

**Solution**:
1. Client should automatically refresh token
2. If refresh fails, re-authenticate with credentials
3. Check refresh token hasn't expired (30 days)

### User Pool Client Misconfigured

**Error**: `InvalidParameterException: Auth flow not enabled`

**Solution**:
1. Go to Cognito Console → User Pool → App clients
2. Edit the app client
3. Enable `ALLOW_USER_PASSWORD_AUTH`
4. Enable `ALLOW_REFRESH_TOKEN_AUTH`
5. Save changes

### Connection Rejected

**Error**: `Unable to connect to Cognito service`

**Solution**:
1. Check network connectivity
2. Verify AWS region is correct
3. Verify User Pool ID is correct
4. Check AWS service status

## Migration from Local Authentication

### Breaking Change Notice

This is a **BREAKING CHANGE** that requires clean installation. Existing admin identities and sessions must be deleted.

### Migration Steps

1. **Backup existing data** (optional, for reference only):
   ```bash
   cp -r src/websocket-server/admin-identities src/websocket-server/admin-identities.backup
   cp -r src/websocket-server/sessions src/websocket-server/sessions.backup
   ```

2. **Delete old data**:
   ```bash
   rm -rf src/websocket-server/admin-identities
   rm -rf src/websocket-server/sessions
   ```

3. **Update code**:
   ```bash
   cd src/websocket-server
   npm install
   npm run build
   ```

4. **Configure Cognito**:
   - Add Cognito variables to `.env`
   - Remove deprecated JWT and admin credential variables

5. **Create Cognito users**:
   - Create admin users in Cognito User Pool
   - Users can use same username/email as before

6. **Restart server**:
   ```bash
   npm start
   ```

7. **Re-authenticate**:
   - All admins must login again with Cognito credentials
   - Sessions will be recreated on first use

### No Automatic Migration

There is no automatic migration from local authentication to Cognito. This is intentional to:
- Ensure clean start with no legacy data issues
- Simplify codebase and reduce technical debt
- Avoid complexity of credential migration

## Additional Resources

- [AWS Cognito Documentation](https://docs.aws.amazon.com/cognito/)
- [amazon-cognito-identity-js Documentation](https://github.com/aws-amplify/amplify-js/tree/main/packages/amazon-cognito-identity-js)
- [Cognito User Pool Best Practices](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pool-settings.html)
- [Token Security Best Practices](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-with-identity-providers.html)

## Support

For issues or questions:
1. Check server logs: `src/websocket-server/logs/`
2. Review health endpoint: `http://localhost:3001/health`
3. Verify Cognito configuration in AWS Console
4. Check CDK deployment status
